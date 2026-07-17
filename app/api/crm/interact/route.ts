import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { sendCDPCommand } from "@/lib/browserless";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Send interaction to Browserless (click, type, scroll, navigate)
 * POST /api/crm/interact
 * 
 * Uses Chrome DevTools Protocol over WebSocket
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

    console.log("[INTERACT] Executing CDP commands via WebSocket...");

    let actionResult: any = null;

    // Execute action via CDP
    switch (action) {
      case "navigate":
        const url = data.url || "https://onlyfans.com";
        console.log("[INTERACT] Navigating to:", url);
        
        // Page.navigate
        actionResult = await sendCDPCommand(wsEndpoint, {
          method: "Page.navigate",
          params: { url },
        });

        // Wait for navigation
        await new Promise(resolve => setTimeout(resolve, data.delay || 2500));
        break;

      case "click":
        const { x, y } = data;
        console.log(`[INTERACT] Clicking at (${x}, ${y})`);
        
        // Input.dispatchMouseEvent
        actionResult = await sendCDPCommand(wsEndpoint, {
          method: "Input.dispatchMouseEvent",
          params: {
            type: "mousePressed",
            x,
            y,
            button: "left",
            clickCount: 1,
          },
        });

        await sendCDPCommand(wsEndpoint, {
          method: "Input.dispatchMouseEvent",
          params: {
            type: "mouseReleased",
            x,
            y,
            button: "left",
          },
        });

        await new Promise(resolve => setTimeout(resolve, data.delay || 250));
        actionResult = { clicked: true, x, y };
        break;

      case "type":
        const text = data.text || "";
        console.log("[INTERACT] Typing:", text.substring(0, 50) + "...");
        
        // Input.dispatchKeyEvent for each character
        for (const char of text) {
          await sendCDPCommand(wsEndpoint, {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyDown",
              text: char,
            },
          });

          await sendCDPCommand(wsEndpoint, {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyUp",
              text: char,
            },
          });
        }

        await new Promise(resolve => setTimeout(resolve, data.delay || 150));
        actionResult = { typed: true, length: text.length };
        break;

      case "scroll":
        const amount = data.scrollY || 100;
        console.log("[INTERACT] Scrolling by:", amount);
        
        // Runtime.evaluate to scroll
        actionResult = await sendCDPCommand(wsEndpoint, {
          method: "Runtime.evaluate",
          params: {
            expression: `window.scrollBy(0, ${amount}); true`,
          },
        });

        await new Promise(resolve => setTimeout(resolve, data.delay || 200));
        actionResult = { scrolled: true, amount };
        break;

      case "reload":
        const reloadUrl = data.target || "https://onlyfans.com";
        console.log("[INTERACT] Reloading:", reloadUrl);
        
        actionResult = await sendCDPCommand(wsEndpoint, {
          method: "Page.navigate",
          params: { url: reloadUrl },
        });

        await new Promise(resolve => setTimeout(resolve, data.delay || 2500));
        actionResult = { reloaded: true, url: reloadUrl };
        break;

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }

    console.log("[INTERACT] ✅ Action completed:", actionResult);

    // Get screenshot
    console.log("[INTERACT] Capturing screenshot...");
    const screenshotBase64 = await sendCDPCommand(wsEndpoint, {
      method: "Page.captureScreenshot",
      params: {},
    });

    return NextResponse.json(
      {
        status: "success",
        action: action,
        actionResult: actionResult,
        screenshot: `data:image/png;base64,${screenshotBase64}`,
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
