import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sync OnlyFans chats for a specific model
 * POST /api/crm/sync-onlyfans-chats
 * Body: { modelId: string, sessionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { modelId, sessionId } = await request.json();

    // Validate inputs
    if (!modelId || !sessionId) {
      return NextResponse.json(
        { error: "Missing modelId or sessionId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get session with auth_cookies
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .eq("id", sessionId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found or not active" },
        { status: 404 }
      );
    }

    if (!session.auth_cookies) {
      return NextResponse.json(
        { error: "No auth cookies stored for this session" },
        { status: 400 }
      );
    }

    // Use Browserless to fetch OnlyFans data with stored cookies
    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;
    if (!browserlessApiKey) {
      return NextResponse.json(
        { error: "Browserless API key not configured" },
        { status: 500 }
      );
    }

    // Construct cookie header from stored auth_cookies
    const cookieHeader = Object.entries(session.auth_cookies as Record<string, string>)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");

    // Fetch from OnlyFans API endpoint using Browserless
    const browserlessUrl = `https://chrome.browserless.io/function?token=${browserlessApiKey}`;

    const functionCode = `
      async (page) => {
        // Set cookies
        const cookies = ${JSON.stringify(session.auth_cookies)};
        for (const [name, value] of Object.entries(cookies)) {
          await page.setCookie({
            name,
            value,
            domain: '.onlyfans.com',
            path: '/'
          });
        }

        // Navigate to inbox
        await page.goto('https://onlyfans.com/api2/v2/inbox', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Get page content (should be JSON)
        const content = await page.content();
        const jsonMatch = content.match(/<pre[^>]*>([^<]+)<\\/pre>/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }

        // Fallback: try to parse as JSON directly
        return JSON.parse(content);
      }
    `;

    const browserlessResponse = await fetch(browserlessUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: functionCode,
        timeout: 30000,
      }),
    });

    if (!browserlessResponse.ok) {
      console.error("Browserless error:", await browserlessResponse.text());
      return NextResponse.json(
        { error: "Failed to fetch OnlyFans data" },
        { status: 500 }
      );
    }

    const onlyFansData = await browserlessResponse.json();

    // Parse OnlyFans inbox response
    // Expected structure: { list: [ { user: { id, username, avatar }, messages, ... }, ... ] }
    const inboxList = onlyFansData?.list || [];

    // Process each conversation
    let fanCount = 0;
    let messageCount = 0;

    for (const conversation of inboxList) {
      const userId = conversation.user?.id;
      const username = conversation.user?.username;

      if (!userId) continue;

      fanCount++;

      // Upsert fan metadata
      const { data: fan } = await supabase
        .from("crm_fan_metadata")
        .upsert(
          {
            fan_id: userId.toString(),
            chatter_id: modelId, // Model ID for grouping
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
      for (const msg of messages) {
        // Check if message already exists
        const { data: existing } = await supabase
          .from("crm_fan_messages")
          .select("id")
          .eq("fan_id", userId.toString())
          .eq("external_message_id", msg.id?.toString())
          .maybeSingle();

        if (existing) continue; // Skip if already stored

        // Insert new message
        const isFromFan = msg.fromUser?.id === userId;

        await supabase.from("crm_fan_messages").insert({
          fan_id: userId.toString(),
          chatter_id: null, // NULL for imported messages - will be set when chatter responds
          external_message_id: msg.id?.toString(),
          message_text: msg.text || "",
          sender: isFromFan ? "fan" : "chatter",
          is_read: msg.isRead !== false,
          created_at: new Date(msg.createdAt).toISOString(),
          attached_media_id: null,
        });

        messageCount++;
      }
    }

    // Update last_synced timestamp
    await supabase
      .from("crm_model_sessions")
      .update({
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    return NextResponse.json({
      status: "success",
      message: "OnlyFans chats synced successfully",
      fansCount: fanCount,
      messagesCount: messageCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
