import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";

export const dynamic = "force-dynamic";

/**
 * Get live screenshot from Browserless OnlyFans session
 * GET /api/crm/screenshot?modelId=xxx
 * 
 * Uses Puppeteer WebSocket connection to existing persistent session
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
    console.log("[SCREENSHOT] ws_endpoint:", wsEndpoint.substring(0, 100) + "...");

    // Connect to existing session via WebSocket
    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
    });

    console.log("[SCREENSHOT] ✅ Connected to browser");

    // Get first page (should be OnlyFans already loaded)
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    console.log("[SCREENSHOT] Taking screenshot...");

    // Take screenshot
    const screenshotBuffer = await page.screenshot({
      type: "png",
      fullPage: false,
    });

    const base64 = screenshotBuffer.toString("base64");

    console.log("[SCREENSHOT] ✅ Screenshot captured:", screenshotBuffer.length, "bytes");

    // Disconnect (don't close - keeps session alive)
    await browser.disconnect();

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
