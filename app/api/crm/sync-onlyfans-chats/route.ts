import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sync OnlyFans chats for a specific model
 * POST /api/crm/sync-onlyfans-chats
 * Body: { modelId: string, sessionId: string }
 */
export async function POST(request: NextRequest) {
  console.log("[SYNC] ===== STARTED =====");
  console.log("[SYNC] Request URL:", request.url);
  console.log("[SYNC] Request method:", request.method);
  
  try {
    console.log("[SYNC] Parsing request body...");
    const body = await request.json();
    console.log("[SYNC] Body parsed:", typeof body);
    
    const { modelId, sessionId } = body;
    console.log("[SYNC] Request data:", { modelId, sessionId });

    // Validate inputs
    if (!modelId || !sessionId) {
      console.error("[SYNC] ❌ Missing modelId or sessionId");
      return NextResponse.json(
        { error: "Missing modelId or sessionId" },
        { status: 400 }
      );
    }

    console.log("[SYNC] ✅ Inputs valid, fetching session from DB...");
    const supabase = createSupabaseAdminClient();

    // Get session with auth_cookies
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .eq("id", sessionId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError) {
      console.error("[SYNC] ❌ Session query error:", sessionError);
      return NextResponse.json(
        { error: "Session query error: " + sessionError.message },
        { status: 500 }
      );
    }

    if (!session) {
      console.error("[SYNC] ❌ Session not found:", { modelId, sessionId });
      return NextResponse.json(
        { error: "Session not found or not active" },
        { status: 404 }
      );
    }

    console.log("[SYNC] ✅ Session found:", {
      model_id: session.model_id,
      is_active: session.is_active,
      has_auth_cookies: !!session.auth_cookies,
    });

    if (!session.auth_cookies) {
      console.error("[SYNC] ❌ No auth_cookies in session");
      return NextResponse.json(
        { error: "No auth cookies stored for this session" },
        { status: 400 }
      );
    }

    // ✅ USE PERSISTENT SESSION: Browserless session is still open with cookies intact
    const browserlessSessionId = session.auth_cookies.browserless_session_id;
    const wsEndpoint = session.auth_cookies.ws_endpoint;
    
    console.log("[SYNC] Browserless config:", {
      has_sessionId: !!browserlessSessionId,
      has_wsEndpoint: !!wsEndpoint,
    });

    if (!browserlessSessionId || !wsEndpoint) {
      console.error("[SYNC] ❌ Missing browserless config");
      return NextResponse.json(
        { error: "Browserless session not properly initialized" },
        { status: 400 }
      );
    }

    console.log("[SYNC] 🔗 Using persistent Browserless session:", browserlessSessionId);

    // Use Browserless to fetch OnlyFans data with the active session
    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;
    if (!browserlessApiKey) {
      console.error("[SYNC] ❌ BROWSERLESS_API_KEY not configured");
      return NextResponse.json(
        { error: "Browserless API key not configured" },
        { status: 500 }
      );
    }

    // Fetch from OnlyFans API endpoint using Browserless
    const browserlessUrl = `https://chrome.browserless.io/function?token=${browserlessApiKey}`;

    const functionCode = `function() {
  await page.goto('https://onlyfans.com/api2/v2/inbox', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  const content = await page.content();
  const jsonMatch = content.match(/<pre[^>]*>([^<]+)<\\/pre>/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }
  return JSON.parse(content);
}`;

    const browserlessResponse = await fetch(browserlessUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: functionCode,
      }),
    });

    console.log("[SYNC] Browserless response status:", browserlessResponse.status);

    if (!browserlessResponse.ok) {
      const errorText = await browserlessResponse.text();
      console.error("[SYNC] ❌ Browserless error:", {
        status: browserlessResponse.status,
        error: errorText.slice(0, 500),
      });
      return NextResponse.json(
        { error: "Failed to fetch OnlyFans data: " + errorText.slice(0, 200) },
        { status: 500 }
      );
    }

    console.log("[SYNC] ✅ Browserless response OK, parsing data...");
    const onlyFansData = await browserlessResponse.json();
    
    console.log("[SYNC] OnlyFans data received:", {
      has_list: !!onlyFansData?.list,
      list_length: onlyFansData?.list?.length || 0,
    });

    // Parse OnlyFans inbox response
    // Expected structure: { list: [ { user: { id, username, avatar }, messages, ... }, ... ] }
    const inboxList = onlyFansData?.list || [];

    // Process each conversation
    let fanCount = 0;
    let messageCount = 0;

    console.log("[SYNC] 🔄 Processing", inboxList.length, "conversations...");

    for (const conversation of inboxList) {
      const userId = conversation.user?.id;
      const username = conversation.user?.username;

      if (!userId) {
        console.warn("[SYNC] ⚠️ Conversation missing user.id");
        continue;
      }

      console.log("[SYNC] Processing fan:", { userId, username });

      fanCount++;

      // Upsert fan metadata
      const { data: fan } = await supabase
        .from("crm_fan_metadata")
        .upsert(
          {
            fan_id: userId.toString(),
            chatter_id: null, // NULL for imported fans - assigned when chatter responds
            model_id: modelId,
            username: username || `User-${userId}`,
            lifetime_value: 0, // TODO: fetch from OnlyFans
            vip_tier: "standard",
            last_interaction: new Date().toISOString(),
          },
          { onConflict: "model_fan_key" }
        )
        .select();

      // Parse and store messages from this conversation
      const messages = conversation.messages || [];
      console.log("[SYNC] Fan has", messages.length, "messages");

      for (const msg of messages) {
        // Check if message already exists
        const { data: existing } = await supabase
          .from("crm_fan_messages")
          .select("id")
          .eq("fan_id", userId.toString())
          .eq("external_message_id", msg.id?.toString())
          .maybeSingle();

        if (existing) {
          console.log("[SYNC] Message already exists, skipping:", msg.id);
          continue; // Skip if already stored
        }

        // Insert new message
        const isFromFan = msg.fromUser?.id === userId;

        const { error: insertError } = await supabase.from("crm_fan_messages").insert({
          fan_id: userId.toString(),
          chatter_id: null, // NULL for imported messages - will be set when chatter responds
          external_message_id: msg.id?.toString(),
          message_text: msg.text || "",
          sender: isFromFan ? "fan" : "chatter",
          is_read: msg.isRead !== false,
          created_at: new Date(msg.createdAt).toISOString(),
          attached_media_id: null,
        });

        if (insertError) {
          console.error("[SYNC] ❌ Failed to insert message:", insertError);
        } else {
          console.log("[SYNC] ✅ Message inserted:", msg.id);
          messageCount++;
        }
      }
    }

    console.log("[SYNC] ✅ Processing complete:", { fanCount, messageCount });

    // Update last_synced timestamp
    const { error: updateError } = await supabase
      .from("crm_model_sessions")
      .update({
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (updateError) {
      console.warn("[SYNC] ⚠️ Failed to update last_synced_at:", updateError);
    } else {
      console.log("[SYNC] ✅ Updated last_synced_at");
    }

    console.log("[SYNC] ===== SUCCESS =====");
    return NextResponse.json({
      status: "success",
      message: "OnlyFans chats synced successfully",
      fansCount: fanCount,
      messagesCount: messageCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SYNC] ❌ FATAL ERROR:", error);
    console.error("[SYNC] Error type:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("[SYNC] Error message:", error instanceof Error ? error.message : String(error));
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
