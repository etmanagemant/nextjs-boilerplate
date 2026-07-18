import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

async function validateAdmin(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const authHeader = req.headers.get("authorization");
    
    if (!authHeader) return false;

    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) return false;

    const user = data.user;
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
  console.log("[BROWSER-LOGIN CONFIRM] Admin clicked confirmation button");

  try {
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      return NextResponse.json(
        { status: "error", error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { modelId, sessionId } = await req.json();

    if (!modelId || !sessionId) {
      return NextResponse.json(
        { status: "error", error: "Missing modelId or sessionId" },
        { status: 400 }
      );
    }

    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      return NextResponse.json(
        { status: "error", error: "VPS not configured" },
        { status: 500 }
      );
    }

    console.log(`[BROWSER-LOGIN CONFIRM] Saving session ${sessionId} for model ${modelId}`);

    // Call VPS /save-session to persist cookies
    const vpsResponse = await fetch(`${vpsUrl}/save-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    if (!vpsResponse.ok) {
      const error = await vpsResponse.text();
      console.error(`[BROWSER-LOGIN CONFIRM] VPS error: ${vpsResponse.status}`);
      throw new Error(`VPS error: ${vpsResponse.status}`);
    }

    const vpsSaveData = await vpsResponse.json();
    console.log(`[BROWSER-LOGIN CONFIRM] ✅ VPS saved cookies: ${vpsSaveData.cookieCount} cookies`);

    // Save session to Supabase
    const supabase = createSupabaseAdminClient();
    const { data: upsertData, error: upsertError } = await supabase
      .from("crm_model_sessions")
      .upsert(
        {
          model_id: modelId,
          is_active: true,
          last_verified_at: new Date().toISOString(),
          auth_cookies: {
            vps_server: vpsUrl,
            session_id: sessionId,
            created_at: new Date().toISOString(),
            verification_status: "verified",
            cookie_count: vpsSaveData.cookieCount,
          },
        },
        { onConflict: "model_id" }
      );

    if (upsertError) {
      console.error("[BROWSER-LOGIN CONFIRM] Supabase error:", upsertError.message);
      throw upsertError;
    }

    console.log(`[BROWSER-LOGIN CONFIRM] ✅ Session saved to Supabase for model ${modelId}`);

    return NextResponse.json({
      status: "success",
      modelId,
      message: "Model connected successfully!",
      cookieCount: vpsSaveData.cookieCount,
    }, { status: 200 });
  } catch (error: any) {
    console.error("[BROWSER-LOGIN CONFIRM] Error:", error.message);
    return NextResponse.json(
      { status: "error", error: error.message },
      { status: 500 }
    );
  }
}
