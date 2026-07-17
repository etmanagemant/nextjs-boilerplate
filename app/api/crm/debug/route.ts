import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint for OnlyFans connection issues
 * GET /api/crm/debug?modelId=xxx
 * 
 * Returns full diagnostic info and tests WebSocket connection
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

    // 3. Check WebSocket endpoint
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

    // 4. Try to send a CDP command to test connection
    const testCommand = await sendCDPCommand(wsEndpoint, {
      method: "Page.captureScreenshot",
      params: {},
    }).catch(e => null);

    const connectionHealthy = testCommand !== null;

    if (!connectionHealthy) {
      console.error("[DEBUG] Connection test failed");
      return NextResponse.json({
        status: "ws_connection_failed",
        modelId,
        message: "WebSocket connection test failed",
        error: "Could not communicate with Browserless session",
        action: "Session may be expired - reconnect model",
      });
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
        screenshotCapable: !!testCommand,
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

/**
 * Send CDP command via WebSocket
 */
async function sendCDPCommand(wsEndpoint: string, command: any): Promise<any> {
  const WebSocket = require("ws");

  return new Promise((resolve, reject) => {
    let messageId = 1;
    const ws = new WebSocket(wsEndpoint);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket timeout"));
    }, 10000);

    ws.on("open", () => {
      const msg = {
        id: messageId++,
        ...command,
      };
      ws.send(JSON.stringify(msg));
    });

    ws.on("message", (data: string) => {
      try {
        const response = JSON.parse(data);

        if (response.result) {
          clearTimeout(timeout);
          ws.close();
          resolve(response.result);
          return;
        }

        if (response.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`CDP Error: ${response.error.message}`));
          return;
        }
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    });

    ws.on("error", (err: any) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("close", () => {
      clearTimeout(timeout);
    });
  });
}
