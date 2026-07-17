import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { sendCDPCommand } from "@/lib/browserless";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Get live screenshot from Browserless OnlyFans session
 * GET /api/crm/screenshot?modelId=xxx
 * 
 * Uses WebSocket + Chrome DevTools Protocol to capture screenshot
 * Returns: Base64 encoded PNG screenshot
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get("modelId");

  if (!modelId) {
    return NextResponse.json(
      { error: "Missing modelId" },
      { status: 400 }
    );
  }

  try {
    console.log("[SCREENSHOT] Fetching for model:", modelId);
    const supabase = createSupabaseAdminClient();

    // Get active session with ws_endpoint
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("auth_cookies")
      .eq("model_id", modelId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("[SCREENSHOT] ❌ Session not found");
      return NextResponse.json(
        { error: "No active session" },
        { status: 404 }
      );
    }

    const wsEndpoint = session.auth_cookies?.ws_endpoint;

    if (!wsEndpoint) {
      console.error("[SCREENSHOT] ❌ WebSocket endpoint not found");
      return NextResponse.json(
        { error: "Session configuration missing - no ws_endpoint" },
        { status: 400 }
      );
    }

    console.log("[SCREENSHOT] Connecting to Browserless via WebSocket...");

    // Send screenshot command via Chrome DevTools Protocol
    const screenshotBase64 = await sendCDPCommand(wsEndpoint, {
      method: "Page.captureScreenshot",
      params: {},
    });

    console.log("[SCREENSHOT] ✅ Screenshot captured");

    return NextResponse.json(
      {
        status: "success",
        screenshot: `data:image/png;base64,${screenshotBase64}`,
        modelId: modelId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[SCREENSHOT] ❌ Error:", err?.message);
    return NextResponse.json(
      { error: err?.message || "Failed to get screenshot" },
      { status: 500 }
    );
  }
}
