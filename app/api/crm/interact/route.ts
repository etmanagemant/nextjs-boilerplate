import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

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

    // Get active session with sessionId
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

    const browserlessSessionId = session.auth_cookies?.browserless_session_id;
    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;

    if (!browserlessSessionId || !browserlessApiKey) {
      return NextResponse.json(
        { error: "Session configuration missing" },
        { status: 400 }
      );
    }

    // Build function code based on action
    let functionCode = "";

    switch (action) {
      case "navigate":
        functionCode = `async function() {
  const result = await page.goto('${data.url || "https://onlyfans.com"}', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(${data.delay || 2500});
  return { navigated: true, url: page.url(), status: result?.status() };
}`;
        break;

      case "click":
        functionCode = `async function() {
  await page.mouse.click(${data.x}, ${data.y});
  await page.waitForTimeout(${data.delay || 250});
  return { clicked: true, x: ${data.x}, y: ${data.y} };
}`;
        break;

      case "type":
        const escapeText = (data.text || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
        functionCode = `async function() {
  await page.keyboard.type('${escapeText}');
  await page.waitForTimeout(${data.delay || 150});
  return { typed: true, length: ${data.text?.length || 0} };
}`;
        break;

      case "scroll":
        functionCode = `async function() {
  await page.evaluate(y => window.scrollBy(0, y), ${data.scrollY || 100});
  await page.waitForTimeout(${data.delay || 200});
  return { scrolled: true, amount: ${data.scrollY || 100} };
}`;
        break;

      case "reload":
        functionCode = `async function() {
  const result = await page.goto('${data.target || "https://onlyfans.com"}', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(${data.delay || 2500});
  return { reloaded: true, url: page.url() };
}`;
        break;

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }

    console.log("[INTERACT] Sending function to Browserless...");

    // Use /function endpoint for persistent sessions
    const functionUrl = `https://production-sfo.browserless.io/function?token=${browserlessApiKey}&sessionId=${encodeURIComponent(browserlessSessionId)}`;

    const functionResponse = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: functionCode }),
    });

    if (!functionResponse.ok) {
      const errorText = await functionResponse.text();
      console.error("[INTERACT] ❌ Function error:", functionResponse.status, errorText.substring(0, 200));
      return NextResponse.json(
        { error: "Action failed", details: errorText.substring(0, 100) },
        { status: 500 }
      );
    }

    const actionResult = await functionResponse.json();
    console.log("[INTERACT] ✅ Action completed:", actionResult);

    // Get new screenshot
    console.log("[INTERACT] Capturing screenshot...");
    const screenshotUrl = `https://production-sfo.browserless.io/page/screenshot?token=${browserlessApiKey}&sessionId=${encodeURIComponent(browserlessSessionId)}`;

    const screenshotResponse = await fetch(screenshotUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!screenshotResponse.ok) {
      console.error("[INTERACT] ⚠️ Screenshot failed:", screenshotResponse.status);
      return NextResponse.json(
        {
          status: "partial_success",
          action: action,
          actionResult: actionResult,
          modelId: modelId,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    const imageBuffer = await screenshotResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");

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
