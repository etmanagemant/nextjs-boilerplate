import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint for OnlyFans connection issues
 * GET /api/crm/debug?modelId=xxx
 * 
 * Returns full diagnostic info for debugging
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

    // 3. Check browserless config
    const browserlessSessionId = session.auth_cookies?.browserless_session_id;
    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;

    if (!browserlessSessionId) {
      return NextResponse.json({
        status: "missing_browserless_session",
        modelId,
        message: "Browserless session ID not found",
        action: "Reconnect model",
      });
    }

    if (!browserlessApiKey) {
      return NextResponse.json({
        status: "missing_api_key",
        message: "BROWSERLESS_API_KEY not configured on server",
        action: "Contact admin - environment variable missing",
      });
    }

    // 4. Try to fetch a screenshot to test connection
    // Connect to persistent session using sessionId query parameter
    const screenshotUrl = `https://chrome.browserless.io/screenshot?token=${browserlessApiKey}&sessionId=${encodeURIComponent(browserlessSessionId)}`;
    
    const screenshotResponse = await fetch(screenshotUrl, { method: "GET" });

    if (!screenshotResponse.ok) {
      const errorText = await screenshotResponse.text();
      return NextResponse.json({
        status: "browserless_error",
        modelId,
        message: "Browserless screenshot failed",
        browserlessStatus: screenshotResponse.status,
        error: errorText.substring(0, 200),
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
        has_browserless_session: true,
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
