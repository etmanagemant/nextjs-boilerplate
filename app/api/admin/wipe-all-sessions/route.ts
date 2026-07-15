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
  console.log("[WIPE] Start");

  try {
    if (!(await validateAdmin(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const supabase = await createClient();

    // DELETE all sessions (wipe clean)
    console.log("[WIPE] Deleting all crm_model_sessions...");

    const { error: deleteError } = await supabase
      .from("crm_model_sessions")
      .delete()
      .neq("model_id", ""); // Delete all

    if (deleteError) {
      console.error("[WIPE] Delete error:", deleteError.message);
      return NextResponse.json(
        { status: "error", error: deleteError.message },
        { status: 500 }
      );
    }

    console.log("[WIPE] ✅ All sessions deleted");

    return NextResponse.json({
      status: "success",
      message: "All sessions wiped clean",
    });
  } catch (err: any) {
    console.error("[WIPE] Error:", err?.message);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
