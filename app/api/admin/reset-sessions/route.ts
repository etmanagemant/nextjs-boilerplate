import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

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
  try {
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { modelIds } = body;

    if (!Array.isArray(modelIds) || modelIds.length === 0) {
      return NextResponse.json(
        { error: "modelIds must be a non-empty array" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Reset all sessions to unverified
    const { data, error } = await supabase
      .from("crm_model_sessions")
      .update({
        is_active: false,
        auth_cookies: {
          verification_status: "unverified",
          reset_at: new Date().toISOString(),
          note: "Reset by admin - invalid previous connection",
        },
      })
      .in("model_id", modelIds)
      .select();

    if (error) {
      console.error("Reset error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log(`[Reset Sessions] Reset ${data?.length || 0} sessions for models: ${modelIds.join(", ")}`);

    return NextResponse.json({
      status: "success",
      message: `Reset ${data?.length || 0} sessions`,
      resetModels: modelIds,
      data,
    });
  } catch (err: any) {
    console.error("[POST] Error:", err?.message);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
