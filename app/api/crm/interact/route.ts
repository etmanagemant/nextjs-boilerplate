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
      case "navigate":
        // Enhanced navigation with better error handling
        functionCode = `function() {
  try {
    const result = await page.goto('${data.url || "https://onlyfans.com"}', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    if (!result) {
      throw new Error('Navigation returned null');
    }
    
    // Wait for page to stabilize
    await page.waitForTimeout(${data.delay || 2500});
    
    // Return success with URL info
    return {
      navigated: true,
      url: page.url(),
      status: result.status()
    };
  } catch (e) {
    throw new Error('Navigation failed: ' + (e instanceof Error ? e.message : String(e)));
  }
}`;
        break;

      case "click":
        functionCode = `function() {
  try {
    const x = ${data.x};
    const y = ${data.y};
    await page.mouse.click(x, y);
    await page.waitForTimeout(${data.delay || 250});
    return { clicked: true, x, y };
  } catch (e) {
    throw new Error('Click failed: ' + (e instanceof Error ? e.message : String(e)));
  }
}`;
        break;

      case "type":
        functionCode = `function() {
  try {
    const text = '${data.text.replace(/'/g, "\\'")}';
    await page.keyboard.type(text);
    await page.waitForTimeout(${data.delay || 150});
    return { typed: true, length: text.length };
  } catch (e) {
    throw new Error('Type failed: ' + (e instanceof Error ? e.message : String(e)));
  }
}`;
        break;

      case "scroll":
        functionCode = `function() {
  try {
    const amount = ${data.scrollY || 100};
    await page.evaluate(y => window.scrollBy(0, y), amount);
    await page.waitForTimeout(${data.delay || 200});
    return { scrolled: true, amount };
  } catch (e) {
    throw new Error('Scroll failed: ' + (e instanceof Error ? e.message : String(e)));
  }
}`;
        break;

      case "reload":
        functionCode = `function() {
  try {
    const url = '${data.target || "https://onlyfans.com"}';
    const result = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(${data.delay || 2500});
    return { reloaded: true, url: page.url() };
  } catch (e) {
    throw new Error('Reload failed: ' + (e instanceof Error ? e.message : String(e)));
  }
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
    const requestBody = {
      code: functionCode,
      sessionId: browserlessSessionId,
    };

    console.log("[INTERACT] 📤 Sending to Browserless:", {
      url: browserlessUrl.replace(browserlessApiKey, "***"),
      sessionId: browserlessSessionId.substring(0, 20) + "...",
      action,
    });

    const response = await fetch(browserlessUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[INTERACT] ❌ Browserless HTTP Error:", response.status);
      console.error("[INTERACT] ❌ Error Response:", errorText.substring(0, 500));
      
      let detailedError = "Browserless action failed";
      try {
        const errorJson = JSON.parse(errorText);
        detailedError = errorJson.error || errorJson.message || errorText;
      } catch (e) {
        detailedError = errorText || `HTTP ${response.status}`;
      }
      
      // Additional diagnostic for common Browserless errors
      if (response.status === 400) {
        detailedError = `Bad Request: ${detailedError} - Session may be invalid or expired`;
      } else if (response.status === 401) {
        detailedError = "Authentication failed - Check BROWSERLESS_API_KEY";
      } else if (response.status === 429) {
        detailedError = "Rate limited - Too many requests";
      }
      
      return NextResponse.json(
        { error: detailedError, status: response.status, action, modelId },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log("[INTERACT] ✅ Action completed:", result);

    // Get new screenshot after action
    console.log("[INTERACT] Capturing new screenshot...");
    // NOTE: Browserless doesn't accept sessionId as query param - it's bound to the token/session
    const screenshotUrl = `https://chrome.browserless.io/screenshot?token=${browserlessApiKey}`;

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
