import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";

export const dynamic = "force-dynamic";

/**
 * Send interaction to Browserless (click, type, scroll, navigate)
 * POST /api/crm/interact
 * 
 * Body: {
 *   modelId: string,
 *   action: "click" | "type" | "scroll" | "navigate",
 *   data: {
 *     x?: number,
 *     y?: number,
 *     text?: string,
 *     url?: string,
 *     delay?: number,
 *     scrollY?: number
 *   }
 * }
 * 
 * Returns: New screenshot after action
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, action, data } = body;

    if (!modelId || !action || !data) {
      return NextResponse.json(
        { error: "Missing modelId, action, or data" },
        { status: 400 }
      );
    }

    console.log(`[INTERACT] Action: ${action} for model: ${modelId}`);

    const supabase = createSupabaseAdminClient();

    // Get active session with ws_endpoint
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("auth_cookies")
      .eq("model_id", modelId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("[INTERACT] ❌ Session not found");
      return NextResponse.json(
        { error: "No active session" },
        { status: 404 }
      );
    }

    const wsEndpoint = session.auth_cookies?.ws_endpoint;

    if (!wsEndpoint) {
      console.error("[INTERACT] ❌ WebSocket endpoint not found");
      return NextResponse.json(
        { error: "Session configuration missing - no ws_endpoint" },
        { status: 400 }
      );
    }

    console.log("[INTERACT] Connecting to Browserless via WebSocket...");

    // Connect to existing session via WebSocket
    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
    });

    console.log("[INTERACT] ✅ Connected to browser");

    // Get first page (should be OnlyFans already loaded)
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    console.log(`[INTERACT] Executing action: ${action}`);

    let actionResult: any = null;

    // Execute action based on type
    switch (action) {
      case "navigate":
        const url = data.url || "https://onlyfans.com";
        console.log("[INTERACT] Navigating to:", url);
        const navigationResult = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise(resolve => setTimeout(resolve, data.delay || 2500));
        actionResult = {
          navigated: true,
          url: page.url(),
          status: navigationResult?.status(),
        };
        break;

      case "click":
        const { x, y } = data;
        console.log(`[INTERACT] Clicking at (${x}, ${y})`);
        await page.mouse.click(x, y);
        await new Promise(resolve => setTimeout(resolve, data.delay || 250));
        actionResult = { clicked: true, x, y };
        break;

      case "type":
        const text = data.text;
        console.log("[INTERACT] Typing:", text?.substring(0, 50) + "...");
        await page.keyboard.type(text, { delay: 10 });
        await new Promise(resolve => setTimeout(resolve, data.delay || 150));
        actionResult = { typed: true, length: text.length };
        break;

      case "scroll":
        const amount = data.scrollY || 100;
        console.log("[INTERACT] Scrolling by:", amount);
        await page.evaluate((y: number) => window.scrollBy(0, y), amount);
        await new Promise(resolve => setTimeout(resolve, data.delay || 200));
        actionResult = { scrolled: true, amount };
        break;

      case "reload":
        const reloadUrl = data.target || "https://onlyfans.com";
        console.log("[INTERACT] Reloading:", reloadUrl);
        const reloadResult = await page.goto(reloadUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise(resolve => setTimeout(resolve, data.delay || 2500));
        actionResult = { reloaded: true, url: page.url() };
        break;

      default:
        await browser.disconnect();
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }

    console.log("[INTERACT] ✅ Action completed:", actionResult);

    // Get new screenshot after action
    console.log("[INTERACT] Capturing new screenshot...");
    const screenshotBuffer = await page.screenshot({
      type: "png",
      fullPage: false,
    });

    const base64 = screenshotBuffer.toString("base64");

    // Disconnect (don't close - keeps session alive)
    await browser.disconnect();

    return NextResponse.json(
      {
        status: "success",
        action: action,
        actionResult: actionResult,
        screenshot: `data:image/png;base64,${base64}`,
        modelId: modelId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[INTERACT] ❌ Error:", err?.message);
    return NextResponse.json(
      { error: err?.message || "Interaction failed" },
      { status: 500 }
    );
  }
}
