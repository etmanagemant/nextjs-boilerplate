import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sync OnlyFans chats for a specific model.
 * POST /api/crm/sync-onlyfans-chats
 * Body: { modelId: string, sessionId: string }
 *
 * Uses the same flat cookie map ({ name: value }) that the login flow and
 * send-message-to-onlyfans.ts already store - fetched through Browserless,
 * independent of whether a live VPS browser is currently running.
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

    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;
    if (!browserlessApiKey) {
      return NextResponse.json({ error: "Browserless API key not configured" }, { status: 500 });
    }

    const functionCode = `
      async (page) => {
        const cookies = ${JSON.stringify(cookieMap)};
        for (const [name, value] of Object.entries(cookies)) {
          try {
            await page.setCookie({ name, value, domain: '.onlyfans.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });
          } catch (e) {}
        }

        try {
          await page.goto('https://onlyfans.com/api2/v2/inbox', { waitUntil: 'networkidle2', timeout: 30000 });
          const content = await page.content();
          const jsonMatch = content.match(/<pre[^>]*>([^<]+)<\\/pre>/);
          const data = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(content);
          return { success: true, data };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
    `;

    const browserlessResponse = await fetch(`https://chrome.browserless.io/function?token=${browserlessApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: functionCode, timeout: 30000 }),
    });

    if (!browserlessResponse.ok) {
      const errorText = await browserlessResponse.text();
      return NextResponse.json({ error: "Failed to fetch OnlyFans data: " + errorText.slice(0, 200) }, { status: 500 });
    }

    const browserlessResult = await browserlessResponse.json();
    if (!browserlessResult.success) {
      return NextResponse.json({ error: browserlessResult.error || "Browserless function failed" }, { status: 502 });
    }

    const inboxList = browserlessResult.data?.list || [];

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
          chatter_id: null,
          model_id: modelId,
          username: username || `User-${userId}`,
          vip_tier: "standard",
          last_interaction: new Date().toISOString(),
        },
        { onConflict: "model_fan_key" }
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
