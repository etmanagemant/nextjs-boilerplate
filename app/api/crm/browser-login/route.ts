import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright"; // ✅ STATIC IMPORT - Required for Vercel
import { createClient } from "@/utils/supabase/server"; // ✅ STATIC IMPORT - NO dynamic imports on Vercel!

// ⚠️ VERCEL CONFIGURATION - Required for Playwright on Serverless
export const dynamic = "force-dynamic"; // Forces Node.js runtime (not Edge)
export const maxDuration = 300; // 5 minutes timeout (Playwright needs time)
export const runtime = "nodejs"; // Explicitly use Node.js runtime for Playwright support

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

async function handleBrowserLogin(req: NextRequest) {
  console.log("[handleBrowserLogin] === START BROWSERLESS MODE ===");
  console.log("[handleBrowserLogin] Method:", req.method);
  console.log("[handleBrowserLogin] Content-Type:", req.headers.get("content-type"));
  
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
      console.log("[handleBrowserLogin] Attempting to parse request body...");
      body = await req.json();
      console.log("[handleBrowserLogin] ✅ Body parsed successfully:", JSON.stringify(body));
    } catch (parseErr: any) {
      console.error("[handleBrowserLogin] ❌ JSON parsing failed:", parseErr?.message);
      console.error("[handleBrowserLogin] Error type:", parseErr?.constructor?.name);
      return safeJsonResponse(
        { 
          status: "error",
          error: `Failed to parse JSON: ${parseErr?.message || "Unknown error"}`,
          details: "Check server logs for debugging info",
          timestamp: new Date().toISOString()
        },
        400
      );
    }
    
    const { modelId } = body;
    console.log("[handleBrowserLogin] Extracted modelId:", modelId, "| Type:", typeof modelId);
    
    if (!modelId || typeof modelId !== "string") {
      console.error("[handleBrowserLogin] ❌ Invalid modelId:", modelId);
      return safeJsonResponse(
        { 
          status: "error",
          error: "Missing or invalid modelId parameter",
          received: { modelId, bodyKeys: Object.keys(body) },
          timestamp: new Date().toISOString()
        },
        400
      );
    }

    // Get API Key
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (!apiKey) {
      console.error("[handleBrowserLogin] ❌ BROWSERLESS_API_KEY is undefined in environment");
      return safeJsonResponse(
        { 
          status: "error",
          error: "Browserless API key not configured in environment",
          timestamp: new Date().toISOString()
        },
        500
      );
    }
    
    console.log("[handleBrowserLogin] API Key length:", apiKey.length);
    console.log("[handleBrowserLogin] API Key first 10 chars:", apiKey.substring(0, 10));

    // Start Browserless session
    console.log("[handleBrowserLogin] Starting Browserless session...");
    console.log("[handleBrowserLogin] API Key configured:", !!apiKey);
    
    let sessionData: any = null;
    let wsEndpoint: string = "";
    
    try {
      console.log("[handleBrowserLogin] Calling Browserless REST API...");
      const sessionResponse = await fetch(`https://chrome.browserless.io/session?token=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ttl: 30,
        }),
      });

      console.log("[handleBrowserLogin] Browserless response status:", sessionResponse.status);
      const contentType = sessionResponse.headers.get("content-type") || "unknown";
      console.log("[handleBrowserLogin] Browserless response content-type:", contentType);

      // Check if response is JSON
      if (!contentType.includes("application/json")) {
        const htmlBody = await sessionResponse.text();
        console.error("[handleBrowserLogin] ❌ Browserless returned non-JSON response (HTML):");
        console.error("[handleBrowserLogin] First 500 chars:", htmlBody.substring(0, 500));
        
        // Common Browserless errors
        if (htmlBody.includes("POST Body")) {
          console.error("[handleBrowserLogin] Detected: Browserless auth/validation error (POST Body response)");
        }
        if (htmlBody.includes("401") || htmlBody.includes("Unauthorized")) {
          console.error("[handleBrowserLogin] Detected: 401 Unauthorized - Invalid API key");
        }
        
        return safeJsonResponse(
          { 
            status: "error",
            error: "Browserless returned error (likely invalid API key)",
            details: htmlBody.substring(0, 200),
            timestamp: new Date().toISOString()
          },
          500
        );
      }

      sessionData = await sessionResponse.json();
      console.log("[handleBrowserLogin] ✅ Browserless session data parsed successfully");
      console.log("[handleBrowserLogin] Response keys:", Object.keys(sessionData));
      console.log("[handleBrowserLogin] connect present:", !!sessionData.connect);
      console.log("[handleBrowserLogin] Session ID:", sessionData.id);
      
      if (!sessionResponse.ok || !sessionData.connect) {
        console.error("[handleBrowserLogin] ❌ Browserless error response:", sessionData);
        return safeJsonResponse(
          { 
            status: "error",
            error: "Failed to create Browserless session",
            details: sessionData.message || sessionData.error || "No connect URL in response",
            timestamp: new Date().toISOString()
          },
          500
        );
      }
      
      wsEndpoint = sessionData.connect;
    } catch (browserlessErr: any) {
      console.error("[handleBrowserLogin] ❌ Browserless fetch failed:", browserlessErr?.message);
      console.error("[handleBrowserLogin] Error type:", browserlessErr?.constructor?.name);
      console.error("[handleBrowserLogin] Error stack:", browserlessErr?.stack?.substring(0, 500));
      return safeJsonResponse(
        { 
          status: "error",
          error: `Browserless connection error: ${browserlessErr?.message || "Unknown"}`,
          timestamp: new Date().toISOString()
        },
        500
      );
    }

    console.log("[handleBrowserLogin] ✅ Session created, connecting...");

    // Connect to browser (chromium already imported at top)
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
