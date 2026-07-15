import { NextRequest, NextResponse } from "next/server";

// Safe JSON response wrapper
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

// Validate admin function
async function validateAdmin(req: NextRequest) {
  try {
    console.log("[validateAdmin] Starting validation...");
    
    const { createClient } = await import("@/utils/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log("[validateAdmin] No user found");
      return false;
    }

    // Check hardcoded admins
    if (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com"
    ) {
      console.log("[validateAdmin] Hardcoded admin matched");
      return true;
    }

    // Check profile role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    
    console.log("[validateAdmin] Profile role:", profile?.role);
    return profile?.role === "admin";
  } catch (err) {
    console.error("[validateAdmin] Error:", err);
    return false;
  }
}

// Main handler using Browserless
async function handleBrowserLogin(req: NextRequest) {
  console.log("[handleBrowserLogin] === START BROWSERLESS MODE ===");
  
  try {
    // Step 1: Validate admin
    console.log("[handleBrowserLogin] Step 1: Validating admin...");
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      console.warn("[handleBrowserLogin] Admin validation failed");
      return safeJsonResponse(
        { 
          status: "error",
          error: "Unauthorized - Admin access required",
          timestamp: new Date().toISOString()
        },
        403
      );
    }
    console.log("[handleBrowserLogin] ✅ Admin validated");

    // Step 2: Parse request body
    console.log("[handleBrowserLogin] Step 2: Parsing request...");
    let body: any = {};
    try {
      body = await req.json();
      console.log("[handleBrowserLogin] Body received:", body);
    } catch (parseErr) {
      console.error("[handleBrowserLogin] Parse error:", parseErr);
      return safeJsonResponse(
        { 
          status: "error",
          error: "Invalid JSON in request body",
          timestamp: new Date().toISOString()
        },
        400
      );
    }
    
    const { modelId } = body;
    if (!modelId || typeof modelId !== "string") {
      console.error("[handleBrowserLogin] Invalid modelId:", modelId);
      return safeJsonResponse(
        { 
          status: "error",
          error: "Missing or invalid modelId parameter",
          timestamp: new Date().toISOString()
        },
        400
      );
    }
    console.log("[handleBrowserLogin] ✅ Model ID validated:", modelId);

    // Step 3: Get Browserless API Key
    console.log("[handleBrowserLogin] Step 3: Getting Browserless API Key...");
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (!apiKey) {
      console.error("[handleBrowserLogin] BROWSERLESS_API_KEY not configured");
      return safeJsonResponse(
        { 
          status: "error",
          error: "Browserless API key not configured",
          timestamp: new Date().toISOString()
        },
        500
      );
    }
    console.log("[handleBrowserLogin] ✅ API Key loaded");

    // Step 4: Generate WebSocket endpoint for Browserless
    console.log("[handleBrowserLogin] Step 4: Generating WebSocket endpoint...");
    const wsEndpoint = `wss://chrome.browserless.io?token=${apiKey}`;
    console.log("[handleBrowserLogin] ✅ WebSocket endpoint ready");

    try {
      // Step 5: Import Playwright to connect to Browserless
      console.log("[handleBrowserLogin] Step 5: Importing Playwright...");
      const { chromium } = await import("playwright");

      // Step 6: Connect to remote Browserless browser
      console.log("[handleBrowserLogin] Step 6: Connecting to Browserless...");
      const browser = await chromium.connectOverCDP(wsEndpoint);
      console.log("[handleBrowserLogin] ✅ Connected to Browserless");

      try {
        // Step 7: Create context and page
        console.log("[handleBrowserLogin] Step 7: Creating browser context...");
        const context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        });
        const page = await context.newPage();
        console.log("[handleBrowserLogin] ✅ Context and page created");

        // Step 8: Navigate to OnlyFans
        console.log("[handleBrowserLogin] Step 8: Navigating to OnlyFans...");
        await page.goto("https://onlyfans.com", {
          waitUntil: "networkidle",
          timeout: 60000,
        });
        console.log("[handleBrowserLogin] ✅ Navigated to OnlyFans");

        // Step 9: Wait for authentication
        console.log("[handleBrowserLogin] Step 9: Waiting for authentication...");
        let authSuccessful = false;
        const maxWaitTime = 300000; // 5 minutes
        const startTime = Date.now();

        page.on("framenavigated", async () => {
          const url = page.url();
          console.log(`[handleBrowserLogin] Page navigated: ${url}`);
          
          if (
            url.includes("onlyfans.com/my") ||
            url.includes("onlyfans.com/home") ||
            url.includes("onlyfans.com/account")
          ) {
            authSuccessful = true;
            console.log("[handleBrowserLogin] ✅ Authentication detected!");
          }
        });

        while (!authSuccessful && Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          
          const url = page.url();
          if (
            url.includes("onlyfans.com/my") ||
            url.includes("onlyfans.com/home") ||
            url.includes("onlyfans.com/account")
          ) {
            authSuccessful = true;
            console.log("[handleBrowserLogin] ✅ Authentication confirmed!");
            break;
          }
        }

        if (!authSuccessful) {
          throw new Error("Authentication timeout - user did not complete login");
        }

        // Step 10: Extract cookies
        console.log("[handleBrowserLogin] Step 10: Extracting cookies...");
        const cookies = await context.cookies();
        if (!cookies || cookies.length === 0) {
          throw new Error("No cookies found after authentication");
        }
        console.log(`[handleBrowserLogin] ✅ Found ${cookies.length} cookies`);

        // Step 11: Save to Supabase
        console.log("[handleBrowserLogin] Step 11: Saving to Supabase...");
        const { createClient } = await import("@/utils/supabase/server");
        const supabase = await createClient();

        const cookieData = {
          cookies: cookies.map((c: any) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite,
          })),
          extractedAt: new Date().toISOString(),
          source: "browserless",
        };

        const { data: sessionData, error: sessionError } = await supabase
          .from("crm_model_sessions")
          .upsert(
            {
              model_id: modelId,
              is_active: true,
              last_verified_at: new Date().toISOString(),
              auth_cookies: cookieData,
            },
            { onConflict: "model_id" }
          )
          .select()
          .single();

        if (sessionError) {
          console.error("[handleBrowserLogin] Supabase error:", sessionError);
          throw new Error(`Failed to save session: ${(sessionError as any)?.message}`);
        }

        console.log("[handleBrowserLogin] ✅ Session saved to Supabase");

        // Step 12: Cleanup
        console.log("[handleBrowserLogin] Step 12: Closing browser...");
        await browser.close();
        console.log("[handleBrowserLogin] ✅ Browser closed");

        // SUCCESS
        console.log("[handleBrowserLogin] === SUCCESS ===");
        return safeJsonResponse(
          {
            status: "success",
            connected: true,
            modelId,
            sessionId: sessionData?.id,
            cookieCount: cookies.length,
            source: "browserless",
            timestamp: new Date().toISOString(),
          },
          200
        );
      } catch (playError: any) {
        console.error("[handleBrowserLogin] Browser error:", playError?.message);
        
        try {
          await browser.close();
        } catch (e) {
          console.error("[handleBrowserLogin] Close error:", e);
        }

        throw playError;
      }
    } catch (err: any) {
      console.error("[handleBrowserLogin] === FATAL ERROR ===");
      console.error("[handleBrowserLogin] Error message:", err?.message);
      console.error("[handleBrowserLogin] Error type:", err?.constructor?.name);
      console.error("[handleBrowserLogin] Error stack:", err?.stack?.substring(0, 1000));

      return safeJsonResponse(
        {
          status: "error",
          connected: false,
          error: err?.message || "Authentication failed",
          errorType: err?.name || err?.constructor?.name || "Unknown",
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  } catch (err: any) {
    console.error("[handleBrowserLogin] === CRITICAL ERROR ===");
    console.error("[handleBrowserLogin] Error:", err?.message);

    return safeJsonResponse(
      {
        status: "error",
        connected: false,
        error: "Server error - check logs",
        errorType: err?.constructor?.name || "Unknown",
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}

// Export POST handler
export async function POST(req: NextRequest) {
  console.log("[POST] New browser login request");
  try {
    return await handleBrowserLogin(req);
  } catch (err: any) {
    console.error("[POST] Uncaught error:", err?.message);
    return safeJsonResponse(
      {
        status: "error",
        error: "Uncaught server error",
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}
