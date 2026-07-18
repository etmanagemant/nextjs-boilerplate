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

async function handleBrowserLogin(req: NextRequest) {
  console.log("[handleBrowserLogin] === START VPS MODE ===");
  console.log("[handleBrowserLogin] Method:", req.method);
  
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
    } catch (parseErr: any) {
      return safeJsonResponse(
        { 
          status: "error",
          error: `Failed to parse JSON: ${parseErr?.message || "Unknown error"}`,
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
          received: { modelId, bodyKeys: Object.keys(body) },
          timestamp: new Date().toISOString()
        },
        400
      );
    }

    // Get VPS URL
    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      return safeJsonResponse(
        { 
          status: "error",
          error: "VPS not configured (VPS_API_URL missing)",
          timestamp: new Date().toISOString()
        },
        500
      );
    }

    console.log("[handleBrowserLogin] Calling VPS /login for model:", modelId);

    // Call VPS login endpoint
    const vpsLoginUrl = `${vpsUrl}/login`;
    const response = await fetch(vpsLoginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId,
        username: body.username,
        password: body.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`VPS responded with ${response.status}`);
    }

    const loginData = await response.json();

    if (loginData.status !== "success") {
      throw new Error(loginData.error || "Login failed on VPS");
    }

    console.log("[handleBrowserLogin] ✅ VPS login successful");

    // Save session info to Supabase
    const supabase = await createClient();
    const { data: upsertData, error: upsertError } = await supabase
      .from("crm_model_sessions")
      .upsert(
        {
          model_id: modelId,
          is_active: true,  // ✅ VPS session ready immediately
          last_verified_at: new Date().toISOString(),
          auth_cookies: {
            vps_server: vpsUrl,
            created_at: new Date().toISOString(),
            verification_status: "verified",
          },
        },
        { onConflict: "model_id" }
      )
      .select()
      .single();

    if (upsertError) {
      throw new Error(`Failed to save session: ${(upsertError as any)?.message}`);
    }

    const actualSessionId = upsertData.id;

    console.log("[handleBrowserLogin] === SUCCESS ===");
    return safeJsonResponse(
      {
        status: "success",
        connected: true,
        message: "Connected to OnlyFans via VPS",
        modelId,
        sessionId: actualSessionId,
        screenshot: loginData.screenshot,
        timestamp: new Date().toISOString(),
      },
      200
    );
  } catch (err: any) {
    console.error("[handleBrowserLogin] ❌ Error:", err?.message);
    return safeJsonResponse(
      { 
        status: "error",
        error: err?.message || "Connection failed",
        timestamp: new Date().toISOString()
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
