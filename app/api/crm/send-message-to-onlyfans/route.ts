import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Send a message to OnlyFans on behalf of the connected model
 * POST /api/crm/send-message-to-onlyfans
 * 
 * Body: {
 *   fanId: string,
 *   chatterId: string,
 *   messageText: string,
 *   localMessageId: string (from crm_fan_messages),
 *   attachedMediaId?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fanId, chatterId, messageText, localMessageId, attachedMediaId } = body;

    // Validate inputs
    if (!fanId || !chatterId || !messageText || !localMessageId) {
      return NextResponse.json(
        { error: "Missing required fields: fanId, chatterId, messageText, localMessageId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    // 1. Find fan's model from crm_fan_metadata
    const { data: fanMeta, error: fanMetaError } = await supabase
      .from("crm_fan_metadata")
      .select("model_id")
      .eq("fan_id", fanId)
      .eq("chatter_id", chatterId)
      .maybeSingle();

    if (fanMetaError || !fanMeta) {
      console.error("Fan metadata not found:", fanMetaError);
      return NextResponse.json(
        { error: "Fan metadata not found for this conversation", sent: false },
        { status: 404 }
      );
    }

    const modelId = fanMeta.model_id;

    // 2. Get model session with auth_cookies
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("Model session not found or not active:", sessionError);
      return NextResponse.json(
        { error: "Model session not found or not active", sent: false },
        { status: 404 }
      );
    }

    if (!session.auth_cookies) {
      return NextResponse.json(
        { error: "No auth cookies stored for this model session", sent: false },
        { status: 400 }
      );
    }

    // 3. Send message via Browserless to OnlyFans API
    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;
    if (!browserlessApiKey) {
      console.error("Browserless API key not configured");
      return NextResponse.json(
        { error: "Browserless API key not configured", sent: false },
        { status: 500 }
      );
    }

    try {
      // Parse auth_cookies if it's a string
      const authCookies = typeof session.auth_cookies === "string"
        ? JSON.parse(session.auth_cookies)
        : session.auth_cookies;

      // Browserless function to send message
      const functionCode = `
        async (page) => {
          // Set cookies from auth
          const cookies = ${JSON.stringify(authCookies)};
          for (const [name, value] of Object.entries(cookies)) {
            try {
              await page.setCookie({
                name,
                value,
                domain: '.onlyfans.com',
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: 'Lax'
              });
            } catch (e) {
              // Skip cookie errors
            }
          }

          // Navigate to OnlyFans inbox API endpoint
          const fanId = "${fanId}";
          const messageText = ${JSON.stringify(messageText)};
          
          try {
            await page.goto('https://onlyfans.com/', {
              waitUntil: 'networkidle2',
              timeout: 15000
            });

            // Make API request to send message
            const response = await page.evaluate(async (fanId, messageText) => {
              try {
                const res = await fetch(\`https://onlyfans.com/api2/v2/message/\\${fanId}/\`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    text: messageText
                  })
                });
                
                if (!res.ok) {
                  return { 
                    success: false, 
                    status: res.status,
                    error: await res.text()
                  };
                }

                const data = await res.json();
                return { 
                  success: true, 
                  data,
                  messageId: data.id || data.result?.id || null
                };
              } catch (e) {
                return { 
                  success: false, 
                  error: e.message 
                };
              }
            }, fanId, messageText);

            return response;
          } catch (e) {
            return { 
              success: false, 
              error: e.message || 'Failed to send message' 
            };
          }
        }
      `;

      const browserlessUrl = `https://chrome.browserless.io/function?token=${browserlessApiKey}`;

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
        const errorText = await browserlessResponse.text();
        console.error("Browserless error:", errorText);
        // Don't treat as critical - message is still saved locally
        return NextResponse.json(
          { 
            success: false, 
            sent: false,
            message: "Message saved locally but failed to send to OnlyFans. Will retry.",
            localMessageId,
            browserlessError: errorText
          },
          { status: 502 }
        );
      }

      const onlyFansResponse = await browserlessResponse.json();

      if (!onlyFansResponse.success) {
        console.warn("OnlyFans send failed:", onlyFansResponse.error);
        // Message is saved locally, but failed to send
        return NextResponse.json(
          {
            success: false,
            sent: false,
            message: "Failed to send to OnlyFans",
            error: onlyFansResponse.error,
            localMessageId,
            retryable: true
          },
          { status: 200 } // Return 200 because local message was saved
        );
      }

      // 4. Message sent successfully - update local record
      const messageId = onlyFansResponse.data?.messageId || 
                       onlyFansResponse.data?.id || 
                       onlyFansResponse.messageId;

      const { error: updateError } = await supabase
        .from("crm_fan_messages")
        .update({
          sent_to_platform: true,
          external_message_id: messageId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localMessageId);

      if (updateError) {
        console.error("Failed to update message status:", updateError);
        // Still return success since OnlyFans delivery worked
      }

      return NextResponse.json({
        success: true,
        sent: true,
        message: "Message sent successfully to OnlyFans",
        localMessageId,
        externalMessageId: messageId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error("Error sending message:", error);
      // Don't fail - message is already saved locally
      return NextResponse.json(
        {
          success: false,
          sent: false,
          message: "Message saved locally but encountered an error sending to OnlyFans",
          error: error instanceof Error ? error.message : "Unknown error",
          localMessageId,
          retryable: true
        },
        { status: 200 }
      );
    }

  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
