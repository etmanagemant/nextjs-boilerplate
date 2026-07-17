import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint for OnlyFans connection issues
 * GET /api/crm/debug?modelId=xxx
 * 
 * Returns full diagnostic info for debugging
 * Tests WebSocket connection health
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get("modelId");

  if (!modelId) {
    return NextResponse.json({
      error: "Missing modelId",
      hint: "Usage: /api/crm/debug?modelId=TESTMODEL",
    }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    // 1. Check session
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json({
        error: "Database error",
        message: sessionError.message,
      }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({
        status: "no_session",
        modelId,
        message: "No session found. Setup required in /management/crm-connect",
        action: "Go to /management/crm-connect and connect this model",
      });
    }

    // 2. Check session active status
    if (!session.is_active) {
      return NextResponse.json({
        status: "inactive_session",
        modelId,
        message: "Session exists but is inactive",
        action: "Reconnect model in /management/crm-connect",
      });
    }

    // 3. Check WebSocket config
    const wsEndpoint = session.auth_cookies?.ws_endpoint;

    if (!wsEndpoint) {
      return NextResponse.json({
        status: "missing_ws_endpoint",
        modelId,
        message: "WebSocket endpoint not found in session",
        action: "Reconnect model",
      });
    }

    console.log("[DEBUG] Testing WebSocket connection...");
    console.log("[DEBUG] ws_endpoint:", wsEndpoint.substring(0, 100) + "...");

    // 4. Try to connect via WebSocket to test connection
    let browser;
    try {
      browser = await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        defaultViewport: null,
      });
      console.log("[DEBUG] ✅ WebSocket connection successful");
    } catch (connectError: any) {
      console.error("[DEBUG] ❌ WebSocket connection failed:", connectError.message);
      return NextResponse.json({
        status: "ws_connection_failed",
        modelId,
        message: "WebSocket connection failed",
        error: connectError.message,
        action: "Session may be expired - reconnect model",
      });
    }

    // 5. Try to get a page and take screenshot
    let screenshotTaken = false;
    try {
      const pages = await browser.pages();
      const page = pages[0] || (await browser.newPage());

      const screenshotBuffer = await page.screenshot({
        type: "png",
        fullPage: false,
      });

      console.log("[DEBUG] ✅ Screenshot successful:", screenshotBuffer.length, "bytes");
      screenshotTaken = true;
    } catch (screenshotError: any) {
      console.error("[DEBUG] ⚠️ Screenshot failed:", screenshotError.message);
    } finally {
      // Disconnect (don't close - keeps session alive)
      await browser.disconnect();
    }

    // All checks passed
    return NextResponse.json({
      status: "healthy",
      modelId,
      message: "Session is active and healthy",
      session: {
        is_active: session.is_active,
        created_at: session.created_at,
        last_used: session.last_used,
        has_ws_endpoint: true,
      },
      websocket: {
        connected: true,
        screenshotCapable: screenshotTaken,
      },
      action: "Ready to load OnlyFans in CRM-Inbox",
    });
  } catch (err: any) {
    return NextResponse.json({
      error: "Unexpected error",
      message: err?.message || String(err),
    }, { status: 500 });
  }
}
