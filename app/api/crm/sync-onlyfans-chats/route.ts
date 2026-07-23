import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sync OnlyFans chats for a specific model.
 * POST /api/crm/sync-onlyfans-chats
 * Body: { modelId: string, sessionId: string }
 *
 * Reuses the model's already-authenticated live session on the VPS (if one
 * is currently open) instead of cloning cookies into a fresh browser - a
 * cookie-only clone got rejected by OnlyFans even with valid cookies, while
 * the live session is proven authenticated. Opportunistic: if nobody has
 * this model connected right now, there's nothing to sync from and this
 * just no-ops instead of erroring.
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
      .select("id")
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

    const vpsResponse = await vpsFetch("/sync-live", {
      method: "POST",
      body: JSON.stringify({ modelId }),
    });

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text();
      return NextResponse.json({ error: "VPS sync-live failed: " + errorText.slice(0, 200) }, { status: 502 });
    }

    const vpsResult = await vpsResponse.json();

    if (vpsResult.status === "no_live_session") {
      return NextResponse.json({
        status: "success",
        message: "No live session open for this model right now - skipped",
        fansCount: 0,
        messagesCount: 0,
        skipped: true,
        timestamp: new Date().toISOString(),
      });
    }

    if (vpsResult.status !== "success") {
      return NextResponse.json({ error: vpsResult.error || "VPS sync-live failed" }, { status: 502 });
    }

    const payload = vpsResult.data?.json;
    const inboxList = payload?.list || payload?.data?.list || [];

    if (!Array.isArray(inboxList) || inboxList.length === 0) {
      console.warn("[SYNC] Unexpected or empty response shape:", JSON.stringify(vpsResult.data).slice(0, 500));
    }

    let fanCount = 0;
    let messageCount = 0;

    for (const conversation of inboxList) {
      const userId = conversation.user?.id ?? conversation.withUser?.id;
      const username = conversation.user?.username ?? conversation.withUser?.username;
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

      const messages = conversation.messages || conversation.lastMessage ? [conversation.lastMessage].filter(Boolean) : [];
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
