import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Get live screenshot from Browserless OnlyFans session
 * GET /api/crm/screenshot?modelId=xxx
 * 
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

    // Get active session
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
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

    const browserlessSessionId = session.auth_cookies?.browserless_session_id;
    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;

    if (!browserlessSessionId || !browserlessApiKey) {
      return NextResponse.json(
        { error: "Session configuration missing" },
        { status: 400 }
      );
    }

    // Get screenshot from Browserless
    // Connect to persistent session using sessionId query parameter
    const screenshotUrl = `https://chrome.browserless.io/screenshot?token=${browserlessApiKey}&sessionId=${encodeURIComponent(browserlessSessionId)}`;

    console.log("[SCREENSHOT] Fetching from Browserless...");
    const response = await fetch(screenshotUrl, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SCREENSHOT] ❌ Browserless error:", errorText);
      return NextResponse.json(
        { error: "Failed to get screenshot" },
        { status: 500 }
      );
    }

    // Get image buffer
    const imageBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");

    console.log("[SCREENSHOT] ✅ Screenshot captured:", imageBuffer.byteLength, "bytes");

    return NextResponse.json(
      {
        status: "success",
        screenshot: `data:image/png;base64,${base64}`,
        modelId: modelId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );

  } catch (err: any) {
    console.error("[SCREENSHOT] ❌ Error:", err?.message);
    return NextResponse.json(
      { error: err?.message },
      { status: 500 }
    );
  }
}
