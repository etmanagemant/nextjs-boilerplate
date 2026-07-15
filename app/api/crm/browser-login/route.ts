import { NextRequest, NextResponse } from "next/server";

// Safe JSON response wrapper - ensures always JSON output
function safeJsonResponse(data: any, status: number = 200) {
  try {
    return NextResponse.json(data, { status });
  } catch (e) {
    console.error("[safeJsonResponse] Error:", e);
    // Fallback to raw Response
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// 🔐 SECURITY: Validate admin access on server
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

// Test Chromium is available
async function testChromium() {
  try {
    console.log("[testChromium] Testing Chromium...");
    
    // Try to import the chromium package with actual binary
    const chromium = await import("@playwright/browser-chromium");
    
    console.log("[testChromium] ✅ @playwright/browser-chromium available");
    return true;
  } catch (err) {
    console.error("[testChromium] Error:", err);
    console.log("[testChromium] Trying fallback...");
    
    try {
      const { chromium } = await import("playwright-core");
      console.log("[testChromium] ✅ playwright-core available");
      return true;
    } catch (err2) {
      console.error("[testChromium] Both imports failed:", err2);
      return false;
    }
  }
}

// Main handler function
async function handleBrowserLogin(req: NextRequest) {
  console.log("[handleBrowserLogin] === START ===");
  
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

    // Step 3: Test Chromium
    console.log("[handleBrowserLogin] Step 3: Testing Chromium...");
    const chromiumOk = await testChromium();
    if (!chromiumOk) {
      console.error("[handleBrowserLogin] Chromium not available!");
      return safeJsonResponse(
        { 
          status: "error",
          error: "Chromium browser not available",
          details: "playwright-core chromium binary not found",
          timestamp: new Date().toISOString()
        },
        503
      );
    }
    console.log("[handleBrowserLogin] ✅ Chromium available");

    // Step 4: Import chromium dynamically
    console.log("[handleBrowserLogin] Step 4: Importing chromium...");
    
    let chromium: any = null;
    try {
      // Try the full package first (has browser binaries)
      chromium = await import("@playwright/browser-chromium");
      console.log("[handleBrowserLogin] ✅ Using @playwright/browser-chromium");
    } catch (e1: any) {
      console.warn("[handleBrowserLogin] @playwright/browser-chromium not available:", e1?.message);
      try {
        // Fallback to playwright-core
        const pw = await import("playwright-core");
        chromium = pw;
        console.log("[handleBrowserLogin] ✅ Using playwright-core (fallback)");
      } catch (e2: any) {
        console.error("[handleBrowserLogin] Both chromium imports failed!");
        throw new Error("Cannot import chromium/playwright");
      }
    }
    
    console.log("[handleBrowserLogin] ✅ Chromium module imported");

    // Step 5: Launch browser
    console.log("[handleBrowserLogin] Step 5: Launching browser...");
    let browser: any = null;
    
    try {
      browser = await chromium.chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });
      
      if (!browser) throw new Error("Browser launch returned null");
      console.log("[handleBrowserLogin] ✅ Browser launched");
    } catch (launchErr: any) {
      console.error("[handleBrowserLogin] Browser launch failed:", launchErr?.message);
      console.error("[handleBrowserLogin] Launch error details:", launchErr?.toString());
      return safeJsonResponse(
        { 
          status: "error",
          error: "Failed to launch browser",
          details: launchErr?.message || "Unknown launch error",
          timestamp: new Date().toISOString()
        },
        500
      );
    }

    try {
      // Step 6: Create context
      console.log("[handleBrowserLogin] Step 6: Creating browser context...");
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        viewport: { width: 1280, height: 720 },
      });
      console.log("[handleBrowserLogin] ✅ Context created");

      // Step 7: Create page
      console.log("[handleBrowserLogin] Step 7: Creating page...");
      const page = await context.newPage();
      console.log("[handleBrowserLogin] ✅ Page created");

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
        throw new Error("Authentication timeout - user did not complete login within 5 minutes");
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
          timestamp: new Date().toISOString(),
        },
        200
      );
    } catch (playError: any) {
      console.error("[handleBrowserLogin] Browser automation error:", playError?.message);
      console.error("[handleBrowserLogin] Error name:", playError?.name);
      console.error("[handleBrowserLogin] Error stack:", playError?.stack?.substring(0, 500));
      
      // Emergency cleanup
      try {
        if (browser) await browser.close();
      } catch (cleanupErr) {
        console.error("[handleBrowserLogin] Cleanup error:", cleanupErr);
      }

      throw playError;
    }
  } catch (err: any) {
    console.error("[handleBrowserLogin] === FATAL ERROR ===");
    console.error("[handleBrowserLogin] Error message:", err?.message);
    console.error("[handleBrowserLogin] Error name:", err?.name);
    console.error("[handleBrowserLogin] Error type:", err?.constructor?.name);
    console.error("[handleBrowserLogin] Error stack:", err?.stack?.substring(0, 1000));

    // Always return safe JSON response
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
}

// Export POST handler with global error wrapper
export async function POST(req: NextRequest) {
  console.log("[POST] New request received");
  try {
    const result = await handleBrowserLogin(req);
    console.log("[POST] Returning result");
    return result;
  } catch (err: any) {
    console.error("[POST] Uncaught error:", err?.message);
    console.error("[POST] Error stack:", err?.stack?.substring(0, 500));
    
    return safeJsonResponse(
      {
        status: "error",
        connected: false,
        error: "Uncaught server error - check logs",
        errorType: err?.constructor?.name || "Unknown",
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}
