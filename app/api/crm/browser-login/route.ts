import { NextRequest, NextResponse } from "next/server";

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
    const { createClient } = await import("@/utils/supabase/server");
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

async function handleBrowserLogin(req: NextRequest) {
  console.log("[handleBrowserLogin] === START BROWSERLESS MODE ===");
  
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
    let body: any = {};
    try {
      body = await req.json();
    } catch (parseErr) {
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
      return safeJsonResponse(
        { 
          status: "error",
          error: "Missing or invalid modelId parameter",
          timestamp: new Date().toISOString()
        },
        400
      );
    }

    // Get API Key
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (!apiKey) {
      return safeJsonResponse(
        { 
          status: "error",
          error: "Browserless API key not configured",
          timestamp: new Date().toISOString()
        },
        500
      );
    }

    // Start Browserless session
    console.log("[handleBrowserLogin] Starting Browserless session...");
    const sessionResponse = await fetch(`https://chrome.browserless.io/session?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const sessionData = await sessionResponse.json();
    
    if (!sessionResponse.ok || !sessionData.webSocketDebuggerUrl) {
      console.error("[handleBrowserLogin] Browserless error:", sessionData);
      return safeJsonResponse(
        { 
          status: "error",
          error: "Failed to create Browserless session",
          details: sessionData.message || "Unknown error",
          timestamp: new Date().toISOString()
        },
        500
      );
    }

    const wsEndpoint = sessionData.webSocketDebuggerUrl;
    console.log("[handleBrowserLogin] ✅ Session created, connecting...");

    // Connect to browser
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(wsEndpoint);
    console.log("[handleBrowserLogin] ✅ Connected to Browserless");

    try {
      // Create context and page
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      });
      const page = await context.newPage();
      console.log("[handleBrowserLogin] ✅ Context and page created");

      // Navigate to OnlyFans
      await page.goto("https://onlyfans.com", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      console.log("[handleBrowserLogin] ✅ Navigated to OnlyFans");

      // Wait for authentication
      let authSuccessful = false;
      const maxWaitTime = 300000;
      const startTime = Date.now();

      page.on("framenavigated", () => {
        const url = page.url();
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
          break;
        }
      }

      if (!authSuccessful) {
        throw new Error("Authentication timeout - user did not complete login");
      }

      // Extract cookies
      const cookies = await context.cookies();
      if (!cookies || cookies.length === 0) {
        throw new Error("No cookies found after authentication");
      }
      console.log(`[handleBrowserLogin] ✅ Found ${cookies.length} cookies`);

      // Save to Supabase
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

      const { data: upsertData, error: upsertError } = await supabase
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

      if (upsertError) {
        throw new Error(`Failed to save session: ${(upsertError as any)?.message}`);
      }

      console.log("[handleBrowserLogin] ✅ Session saved to Supabase");

      // Cleanup
      await browser.close();
      console.log("[handleBrowserLogin] ✅ Browser closed");

      // SUCCESS
      console.log("[handleBrowserLogin] === SUCCESS ===");
      return safeJsonResponse(
        {
          status: "success",
          connected: true,
          modelId,
          sessionId: upsertData?.id,
          cookieCount: cookies.length,
          source: "browserless",
          timestamp: new Date().toISOString(),
        },
        200
      );
    } catch (browserErr: any) {
      console.error("[handleBrowserLogin] Browser error:", browserErr?.message);
      
      try {
        await browser.close();
      } catch (e) {
        console.error("[handleBrowserLogin] Close error:", e);
      }

      throw browserErr;
    }
  } catch (err: any) {
    console.error("[handleBrowserLogin] === ERROR ===");
    console.error("[handleBrowserLogin] Message:", err?.message);
    console.error("[handleBrowserLogin] Type:", err?.constructor?.name);

    return safeJsonResponse(
      {
        status: "error",
        connected: false,
        error: err?.message || "Authentication failed",
        errorType: err?.constructor?.name || "Unknown",
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}

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
