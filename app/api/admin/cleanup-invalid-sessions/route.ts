import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

async function validateAdmin(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    return (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com"
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  console.log("[ADMIN-CLEANUP] Start");

  try {
    if (!(await validateAdmin(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const supabase = await createClient();

    // Reset these models to disconnected
    const modelsToReset = ["SexylLexi", "testmodel"];
    
    console.log("[ADMIN-CLEANUP] Resetting:", modelsToReset);

    const { data, error } = await supabase
      .from("crm_model_sessions")
      .update({
        is_active: false,
        auth_cookies: {
          verification_status: "unverified",
          reset_at: new Date().toISOString(),
          note: "Reset - never properly verified",
        },
      })
      .in("model_id", modelsToReset)
      .select();

    if (error) {
      console.error("[ADMIN-CLEANUP] Error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[ADMIN-CLEANUP] Success, reset:", data?.length || 0);

    return NextResponse.json({
      status: "success",
      message: `Reset ${data?.length || 0} sessions`,
      resetModels: modelsToReset,
    });
  } catch (err: any) {
    console.error("[ADMIN-CLEANUP] Error:", err?.message);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
