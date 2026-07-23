import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IGNORED_COOKIE_KEYS = ["vps_server", "session_id", "created_at", "verification_status", "cookie_count"];

/**
 * Sync OnlyFans chats for a specific model.
 * POST /api/crm/sync-onlyfans-chats
 * Body: { modelId: string, sessionId: string }
 *
 * Uses the same flat cookie map ({ name: value }) the login flow stores,
 * fetched through a short-lived headless browser on the VPS (not
 * Browserless - its free tier is only 100 sessions/month, nowhere near
 * enough for routine polling every model gets called for periodically).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, sessionId } = body;

    if (!modelId || !sessionId) {
      return NextResponse.json({ error: "Missing modelId or sessionId" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .eq("id", sessionId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json({ error: "Session query error: " + sessionError.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: "Session not found or not active" }, { status: 404 });
    }

    const cookieMap = session.auth_cookies as Record<string, string> | null;
    if (!cookieMap || typeof cookieMap !== "object" || Object.keys(cookieMap).length === 0) {
      return NextResponse.json({ error: "No auth cookies stored for this session" }, { status: 400 });
    }

    const cookies = Object.entries(cookieMap)
      .filter(([name]) => !IGNORED_COOKIE_KEYS.includes(name))
      .map(([name, value]) => ({ name, value, domain: ".onlyfans.com", path: "/" }));

    const vpsResponse = await vpsFetch("/fetch-inbox", {
      method: "POST",
      body: JSON.stringify({ modelId, cookies }),
    });

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text();
      return NextResponse.json({ error: "VPS fetch-inbox failed: " + errorText.slice(0, 200) }, { status: 502 });
    }

    const vpsResult = await vpsResponse.json();
    if (vpsResult.status !== "success") {
      return NextResponse.json({ error: vpsResult.error || "VPS fetch-inbox failed" }, { status: 502 });
    }

    const inboxList = vpsResult.data?.list || [];

    let fanCount = 0;
    let messageCount = 0;

    for (const conversation of inboxList) {
      const userId = conversation.user?.id;
      const username = conversation.user?.username;
      if (!userId) continue;

      fanCount++;

      await supabase.from("crm_fan_metadata").upsert(
        {
          fan_id: userId.toString(),
          model_id: modelId,
          username: username || `User-${userId}`,
          vip_tier: "standard",
          last_interaction: new Date().toISOString(),
        },
        { onConflict: "model_id,fan_id" }
      );

      const messages = conversation.messages || [];
      for (const msg of messages) {
        const { data: existing } = await supabase
          .from("crm_fan_messages")
          .select("id")
          .eq("fan_id", userId.toString())
          .eq("external_message_id", msg.id?.toString())
          .maybeSingle();

        if (existing) continue;

        const isFromFan = msg.fromUser?.id === userId;
        const { error: insertError } = await supabase.from("crm_fan_messages").insert({
          fan_id: userId.toString(),
          chatter_id: null,
          external_message_id: msg.id?.toString(),
          message_text: msg.text || "",
          sender: isFromFan ? "fan" : "chatter",
          is_read: msg.isRead !== false,
          created_at: new Date(msg.createdAt).toISOString(),
          attached_media_id: null,
        });

        if (!insertError) messageCount++;
      }
    }

    await supabase
      .from("crm_model_sessions")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", sessionId);

    return NextResponse.json({
      status: "success",
      message: "OnlyFans chats synced successfully",
      fansCount: fanCount,
      messagesCount: messageCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SYNC] Fatal error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
