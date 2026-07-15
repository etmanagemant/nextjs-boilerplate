import { NextRequest, NextResponse } from "next/server";
import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { createClient } from "@/utils/supabase/server";

// 🔐 SECURITY: Validate admin access on server
async function validateAdmin(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    // Check hardcoded admins
    if (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com"
    ) {
      return true;
    }

    // Check profile role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    return profile?.role === "admin";
  } catch (err) {
    console.error("Admin validation error:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // 🔐 SECURITY: Validate admin
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    // Extract model_id from request body
    const body = await req.json().catch(() => ({}));
    const { modelId } = body;

    if (!modelId || typeof modelId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid modelId parameter" },
        { status: 400 }
      );
    }

    console.log(`🚀 Starting browser session for model: ${modelId}`);

    // 🌐 LAUNCH HEADLESS BROWSER
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

      // 📱 Create browser context with realistic user agent
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        viewport: { width: 1280, height: 720 },
      });

      page = await context.newPage();

      // 🎯 Navigate to OnlyFans
      console.log("🌐 Navigating to OnlyFans...");
      await page.goto("https://onlyfans.com", {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      // ⏳ MONITOR PAGE STATE: Wait for successful authentication
      // This typically happens when user logs in and gets redirected to dashboard
      console.log("👀 Monitoring authentication state...");

      let authSuccessful = false;
      const maxWaitTime = 300000; // 5 minutes timeout
      const startTime = Date.now();

      // Listen for navigation/URL changes
      page.on("framenavigated", async () => {
        if (!page) return;
        const currentUrl = page.url();
        console.log(`📍 Page URL: ${currentUrl}`);

        // Check if user has reached authenticated area (typically /my or /home)
        if (
          currentUrl.includes("onlyfans.com/my") ||
          currentUrl.includes("onlyfans.com/home") ||
          currentUrl.includes("onlyfans.com/account")
        ) {
          authSuccessful = true;
          console.log("✅ Authentication detected!");
        }
      });

      // Wait for authentication OR timeout
      while (!authSuccessful && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Also check current URL
        if (page) {
          const currentUrl = page.url();
          if (
            currentUrl.includes("onlyfans.com/my") ||
            currentUrl.includes("onlyfans.com/home") ||
            currentUrl.includes("onlyfans.com/account")
          ) {
            authSuccessful = true;
            console.log("✅ Authentication confirmed!");
            break;
          }
        }
      }

      if (!authSuccessful) {
        throw new Error(
          "Authentication timeout - User did not complete login within 5 minutes"
        );
      }

      // 🍪 EXTRACT COOKIES FROM AUTHENTICATED SESSION
      console.log("🍪 Extracting authentication cookies...");
      
      if (!context) {
        throw new Error("Browser context is not available");
      }

      const cookies = await context.cookies();

      if (!cookies || cookies.length === 0) {
        throw new Error("No cookies found after authentication");
      }

      console.log(`✅ Found ${cookies.length} cookies`);

      // 💾 SAVE TO SUPABASE
      const supabase = await createClient();

      // Prepare cookie data as JSONB
      const cookieData = {
        cookies: cookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
        })),
        extractedAt: new Date().toISOString(),
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      };

      console.log("💾 Saving session to Supabase...");

      // Upsert session record
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
        console.error("Supabase error:", sessionError);
        throw new Error(`Failed to save session: ${sessionError.message}`);
      }

      console.log("✅ Session saved successfully!");

      // 🧹 CLEANUP: Close browser
      await browser.close();

      // ✅ SUCCESS RESPONSE
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
      console.error("Browser automation error:", playError);

      // 🧹 Emergency cleanup
      try {
        if (browser) await browser.close();
      } catch (closeErr) {
        console.error("Error closing browser:", closeErr);
      }

      throw new Error(
        `Browser automation failed: ${playError?.message || "Unknown error"}`
      );
    }
  } catch (err: any) {
    console.error("🔴 API Error:", err);

    return NextResponse.json(
      {
        status: "error",
        connected: false,
        error: err?.message || "Authentication failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
