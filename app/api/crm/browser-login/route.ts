import { NextRequest, NextResponse } from "next/server";
import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { createClient } from "@/utils/supabase/server";

// 🔐 SECURITY: Validate admin access on server
async function validateAdmin(req: NextRequest) {
  try {
    console.log("[validateAdmin] Starting validation...");
    
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

// Main handler function
async function handleBrowserLogin(req: NextRequest) {
  console.log("[handleBrowserLogin] === START ===");
  
  try {
    // Step 1: Validate admin
    console.log("[handleBrowserLogin] Step 1: Validating admin...");
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      console.warn("[handleBrowserLogin] Admin validation failed");
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }
    console.log("[handleBrowserLogin] ✅ Admin validated");

    // Step 2: Parse request body
    console.log("[handleBrowserLogin] Step 2: Parsing request...");
    let body: any = {};
    try {
      body = await req.json();
      console.log("[handleBrowserLogin] Body:", body);
    } catch (parseErr) {
      console.error("[handleBrowserLogin] Parse error:", parseErr);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    
    const { modelId } = body;
    if (!modelId || typeof modelId !== "string") {
      console.error("[handleBrowserLogin] Invalid modelId:", modelId);
      return NextResponse.json(
        { error: "Missing or invalid modelId parameter" },
        { status: 400 }
      );
    }
    console.log("[handleBrowserLogin] Model ID validated:", modelId);

    // Step 3: Launch browser
    console.log("[handleBrowserLogin] Step 3: Launching Chromium...");
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });

      if (!browser) throw new Error("Browser launch returned null");
      console.log("[handleBrowserLogin] ✅ Chromium launched");

      // Step 4: Create context
      console.log("[handleBrowserLogin] Step 4: Creating context...");
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        viewport: { width: 1280, height: 720 },
      });

      if (!context) throw new Error("Context creation returned null");
      console.log("[handleBrowserLogin] ✅ Context created");

      // Step 5: Create page
      console.log("[handleBrowserLogin] Step 5: Creating page...");
      page = await context.newPage();
      if (!page) throw new Error("Page creation returned null");
      console.log("[handleBrowserLogin] ✅ Page created");

      // Step 6: Navigate to OnlyFans
      console.log("[handleBrowserLogin] Step 6: Navigating to OnlyFans...");
      await page.goto("https://onlyfans.com", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      console.log("[handleBrowserLogin] ✅ Navigated to OnlyFans");

      // Step 7: Monitor authentication
      console.log("[handleBrowserLogin] Step 7: Waiting for authentication...");
      let authSuccessful = false;
      const maxWaitTime = 300000; // 5 minutes
      const startTime = Date.now();

      page.on("framenavigated", async () => {
        if (!page) return;
        const url = page.url();
        console.log(`[handleBrowserLogin] Navigation: ${url}`);
        
        if (
          url.includes("onlyfans.com/my") ||
          url.includes("onlyfans.com/home") ||
          url.includes("onlyfans.com/account")
        ) {
          authSuccessful = true;
          console.log("[handleBrowserLogin] ✅ Auth detected!");
        }
      });

      while (!authSuccessful && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        if (page) {
          const url = page.url();
          if (
            url.includes("onlyfans.com/my") ||
            url.includes("onlyfans.com/home") ||
            url.includes("onlyfans.com/account")
          ) {
            authSuccessful = true;
            console.log("[handleBrowserLogin] ✅ Auth confirmed!");
            break;
          }
        }
      }

      if (!authSuccessful) {
        throw new Error("Authentication timeout");
      }

      // Step 8: Extract cookies
      console.log("[handleBrowserLogin] Step 8: Extracting cookies...");
      if (!context) throw new Error("Context not available");
      
      const cookies = await context.cookies();
      if (!cookies || cookies.length === 0) {
        throw new Error("No cookies found");
      }
      console.log(`[handleBrowserLogin] ✅ Found ${cookies.length} cookies`);

      // Step 9: Save to Supabase
      console.log("[handleBrowserLogin] Step 9: Saving to Supabase...");
      const supabase = await createClient();

      const cookieData = {
        cookies: cookies.map((c) => ({
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
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
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
        throw new Error(`DB save failed: ${(sessionError as any)?.message}`);
      }

      console.log("[handleBrowserLogin] ✅ Saved to Supabase");

      // Step 10: Cleanup
      console.log("[handleBrowserLogin] Step 10: Closing browser...");
      await browser.close();
      console.log("[handleBrowserLogin] ✅ Browser closed");

      // Success response
      console.log("[handleBrowserLogin] === SUCCESS ===");
      return NextResponse.json(
        {
          status: "success",
          connected: true,
          modelId,
          sessionId: sessionData?.id,
          cookieCount: cookies.length,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    } catch (playError: any) {
      console.error("[handleBrowserLogin] Browser error:", playError?.message);
      
      // Emergency cleanup
      try {
        if (browser) await browser.close();
      } catch (e) {
        console.error("[handleBrowserLogin] Cleanup error:", e);
      }

      throw playError;
    }
  } catch (err: any) {
    console.error("[handleBrowserLogin] Fatal error:", err?.message);
    
    // Always return JSON
    return NextResponse.json(
      {
        status: "error",
        connected: false,
        error: err?.message || "Authentication failed",
        errorType: err?.constructor?.name || "Unknown",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Export POST handler
export async function POST(req: NextRequest) {
  console.log("[POST] New request");
  try {
    return await handleBrowserLogin(req);
  } catch (err: any) {
    console.error("[POST] Uncaught error:", err?.message);
    return NextResponse.json(
      {
        status: "error",
        connected: false,
        error: "Uncaught error - check logs",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
