import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

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

export async function POST(req: NextRequest) {
  console.log("[BROWSER-LOGIN INIT] Starting...");

  try {
    // Validate admin
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      return NextResponse.json(
        { 
          status: "error",
          error: "Unauthorized - Admin access required",
        },
        { status: 403 }
      );
    }

    const { modelId } = await req.json();

    if (!modelId) {
      return NextResponse.json(
        { 
          status: "error",
          error: "Missing modelId",
        },
        { status: 400 }
      );
    }

    // Get VPS URL
    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      return NextResponse.json(
        { 
          status: "error",
          error: "VPS not configured",
        },
        { status: 500 }
      );
    }

    console.log(`[BROWSER-LOGIN INIT] Calling VPS to start session for model: ${modelId}`);

    // Call VPS /init-session
    const response = await fetch(`${vpsUrl}/init-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[BROWSER-LOGIN INIT] VPS error: ${response.status} - ${error}`);
      throw new Error(`VPS error: ${response.status}`);
    }

    const vpsData = await response.json();

    console.log(`[BROWSER-LOGIN INIT] ✅ Session created: ${vpsData.sessionId}`);

    // Return session ID to frontend (VPS format)
    return NextResponse.json({
      status: "success",
      sessionId: vpsData.sessionId,
      message: "Browser window opened. Please login with model credentials.",
    }, { status: 200 });
  } catch (error: any) {
    console.error("[BROWSER-LOGIN INIT] Error:", error.message);
    return NextResponse.json(
      { 
        status: "error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
