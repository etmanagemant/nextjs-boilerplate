import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Send interaction to Browserless (click, type, scroll)
 * POST /api/crm/interact
 * 
 * Body: {
 *   modelId: string,
 *   action: "click" | "type" | "scroll",
 *   data: {
 *     x?: number,
 *     y?: number,
 *     text?: string,
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

    // Get active session
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
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

    // Build Browserless function code based on action
    let functionCode = "";

    switch (action) {
      case "click":
        functionCode = `function() {
  await page.mouse.click(${data.x}, ${data.y});
  await page.waitForTimeout(${data.delay || 200});
  return { clicked: true };
}`;
        break;

      case "type":
        functionCode = `function() {
  await page.keyboard.type('${data.text.replace(/'/g, "\\'")}');
  await page.waitForTimeout(${data.delay || 100});
  return { typed: true };
}`;
        break;

      case "scroll":
        functionCode = `function() {
  await page.evaluate(y => window.scrollBy(0, y), ${data.scrollY || 100});
  await page.waitForTimeout(${data.delay || 200});
  return { scrolled: true };
}`;
        break;

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }

    console.log("[INTERACT] Executing function...");

    // Send to Browserless
    const browserlessUrl = `https://chrome.browserless.io/function?token=${browserlessApiKey}`;

    const response = await fetch(browserlessUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: functionCode,
        sessionId: browserlessSessionId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[INTERACT] ❌ Error:", errorText);
      return NextResponse.json(
        { error: "Browserless action failed" },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log("[INTERACT] ✅ Action completed:", result);

    // Get new screenshot after action
    console.log("[INTERACT] Capturing new screenshot...");
    const screenshotUrl = `https://chrome.browserless.io/screenshot?token=${browserlessApiKey}&sessionId=${browserlessSessionId}`;

    const screenshotResponse = await fetch(screenshotUrl, {
      method: "GET",
    });

    const imageBuffer = await screenshotResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");

    return NextResponse.json(
      {
        status: "success",
        action: action,
        actionResult: result,
        screenshot: `data:image/png;base64,${base64}`,
        modelId: modelId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );

  } catch (err: any) {
    console.error("[INTERACT] ❌ Error:", err?.message);
    return NextResponse.json(
      { error: err?.message },
      { status: 500 }
    );
  }
}
