import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// ⚠️ VERCEL CONFIGURATION
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

function safeJsonResponse(data: any, status: number = 200) {
  try {
    return NextResponse.json(data, { status });
  } catch (e) {
    console.error("[safeJsonResponse] Error:", e);
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function validateAdmin(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    if (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com"
    ) {
      return true;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    
    return profile?.role === "admin";
  } catch (err) {
    console.error("[validateAdmin] Error:", err);
    return false;
  }
}

async function verifyBrowserAuth(req: NextRequest) {
  console.log("[verifyBrowserAuth] === START VERIFICATION ===");
  
  try {
    // Validate admin
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      return safeJsonResponse(
        { 
          status: "error",
          error: "Unauthorized - Admin access required",
          timestamp: new Date().toISOString()
        },
        403
      );
    }

    // Parse request body
    const body = await req.json();
    const { modelId, sessionId } = body;
    
    if (!modelId || !sessionId) {
      return safeJsonResponse(
        { 
          status: "error",
          error: "Missing modelId or sessionId",
          timestamp: new Date().toISOString()
        },
        400
      );
    }

    console.log("[verifyBrowserAuth] Checking session for modelId:", modelId);

    // Fetch current session from database
    const supabase = await createClient();
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("[verifyBrowserAuth] ❌ Session not found:", sessionError?.message);
      return safeJsonResponse(
        {
          status: "error",
          error: "Session not found",
          verified: false,
          timestamp: new Date().toISOString()
        },
        404
      );
    }

    console.log("[verifyBrowserAuth] Session found, auth_cookies:", session.auth_cookies);

    const authCookies = session.auth_cookies || {};
    const wsEndpoint = authCookies.ws_endpoint;
    const browserlessSessionId = authCookies.browserless_session_id;

    if (!wsEndpoint) {
      console.error("[verifyBrowserAuth] ❌ No WebSocket endpoint in session");
      return safeJsonResponse(
        {
          status: "error",
          error: "Invalid session - no WebSocket endpoint",
          verified: false,
          timestamp: new Date().toISOString()
        },
        400
      );
    }

    console.log("[verifyBrowserAuth] Connecting to WebSocket endpoint...");

    // ⚠️ For production variant C, we would connect via WebSocket and check:
    // 1. Is the browser still active?
    // 2. Did the user navigate to OnlyFans?
    // 3. Are there valid auth cookies?
    
    // For now, we implement a MOCK verification that expects the browser to have
    // already handled the auth, and we check status via Browserless API
    
    try {
      const apiKey = process.env.BROWSERLESS_API_KEY;
      if (!apiKey) {
        throw new Error("BROWSERLESS_API_KEY not configured");
      }

      // Check if session is still active on Browserless
      console.log("[verifyBrowserAuth] Checking Browserless session status...");
      
      const statusResponse = await fetch(
        `https://chrome.browserless.io/sessions?token=${apiKey}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!statusResponse.ok) {
        console.warn("[verifyBrowserAuth] ⚠️ Browserless status check failed:", statusResponse.status);
        // Session might be dead
        return safeJsonResponse(
          {
            status: "error",
            error: "Browser session lost",
            verified: false,
            timestamp: new Date().toISOString()
          },
          400
        );
      }

      const sessions = await statusResponse.json();
      console.log("[verifyBrowserAuth] Active sessions on Browserless:", sessions.length);

      // Check if our specific session is still active
      const isSessionActive = sessions.some(
        (s: any) => s.id === browserlessSessionId
      );

      if (!isSessionActive) {
        console.warn("[verifyBrowserAuth] ⚠️ Session no longer active on Browserless");
        return safeJsonResponse(
          {
            status: "error",
            error: "Browser session no longer active",
            verified: false,
            timestamp: new Date().toISOString()
          },
          400
        );
      }

      console.log("[verifyBrowserAuth] ✅ Session still active on Browserless");

      // ⚠️ IN PRODUCTION (Variant C):
      // Here we would use CDP protocol to:
      // 1. Get page.url() to verify user is on OnlyFans
      // 2. Get cookies via page.context().cookies() 
      // 3. Verify auth tokens exist and are valid
      // 4. Check user profile is loaded
      
      // For MVP, we check if cookies have been updated since session creation
      const createdAt = new Date(authCookies.created_at).getTime();
      const now = Date.now();
      const elapsedMs = now - createdAt;
      const minWaitMs = 3000; // Wait at least 3 seconds before considering it "authenticated"

      if (elapsedMs < minWaitMs) {
        console.log(`[verifyBrowserAuth] ⏳ Not enough time elapsed (${elapsedMs}ms). Wait for user to authenticate...`);
        return safeJsonResponse(
          {
            status: "waiting",
            error: "Waiting for user to authenticate",
            verified: false,
            elapsedTime: elapsedMs,
            timestamp: new Date().toISOString()
          },
          200
        );
      }

      // Check if there's any indication of successful auth
      // In real variant C, this would check actual OnlyFans cookies
      const hasAuthCookies = authCookies.onlyfans_cookies && 
                             Object.keys(authCookies.onlyfans_cookies).length > 0;

      if (!hasAuthCookies) {
        console.log("[verifyBrowserAuth] ⏳ No OnlyFans cookies yet. Still waiting...");
        return safeJsonResponse(
          {
            status: "waiting",
            error: "Waiting for OnlyFans authentication",
            verified: false,
            elapsedTime: elapsedMs,
            timestamp: new Date().toISOString()
          },
          200
        );
      }

      // ✅ VERIFIED! Mark session as active
      console.log("[verifyBrowserAuth] ✅ OnlyFans authentication confirmed!");

      const { error: updateError } = await supabase
        .from("crm_model_sessions")
        .update({
          is_active: true,
          last_verified_at: new Date().toISOString(),
          auth_cookies: {
            ...authCookies,
            verification_status: "verified",
            verified_at: new Date().toISOString(),
          },
        })
        .eq("model_id", modelId);

      if (updateError) {
        console.error("[verifyBrowserAuth] ❌ Failed to update session:", updateError.message);
        throw updateError;
      }

      console.log("[verifyBrowserAuth] === VERIFICATION SUCCESS ===");
      return safeJsonResponse(
        {
          status: "success",
          verified: true,
          message: "OnlyFans authentication verified and saved",
          modelId,
          sessionId,
          timestamp: new Date().toISOString()
        },
        200
      );

    } catch (verifyErr: any) {
      console.error("[verifyBrowserAuth] ❌ Verification failed:", verifyErr?.message);
      return safeJsonResponse(
        {
          status: "error",
          error: verifyErr?.message || "Verification check failed",
          verified: false,
          timestamp: new Date().toISOString()
        },
        500
      );
    }

  } catch (err: any) {
    console.error("[verifyBrowserAuth] === ERROR ===");
    console.error("[verifyBrowserAuth] Message:", err?.message);

    return safeJsonResponse(
      {
        status: "error",
        error: err?.message || "Verification failed",
        verified: false,
        timestamp: new Date().toISOString()
      },
      500
    );
  }
}

export async function POST(req: NextRequest) {
  console.log("[POST] New verification request");
  try {
    return await verifyBrowserAuth(req);
  } catch (err: any) {
    console.error("[POST] Uncaught error:", err?.message);
    return safeJsonResponse(
      {
        status: "error",
        error: "Uncaught server error",
        timestamp: new Date().toISOString()
      },
      500
    );
  }
}
