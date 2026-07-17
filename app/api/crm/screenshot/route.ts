import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Get live screenshot from Browserless OnlyFans session
 * GET /api/crm/screenshot?modelId=xxx
 * 
 * Uses Browserless /page/screenshot endpoint with sessionId
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

    // Get active session with sessionId
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

    const browserlessSessionId = session.auth_cookies?.browserless_session_id;
    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;

    if (!browserlessSessionId || !browserlessApiKey) {
      return NextResponse.json(
        { error: "Session configuration missing" },
        { status: 400 }
      );
    }

    console.log("[SCREENSHOT] Getting screenshot from Browserless...");
    
    // Use /page/screenshot endpoint for persistent sessions
    const screenshotUrl = `https://production-sfo.browserless.io/page/screenshot?token=${browserlessApiKey}&sessionId=${encodeURIComponent(browserlessSessionId)}`;

    const response = await fetch(screenshotUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SCREENSHOT] ❌ Browserless error:", response.status, errorText.substring(0, 200));
      return NextResponse.json(
        { error: "Failed to get screenshot from Browserless", details: errorText.substring(0, 100) },
        { status: 500 }
      );
    }

    // Response should be PNG image
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
      { error: err?.message || "Failed to get screenshot" },
      { status: 500 }
    );
  }
}
