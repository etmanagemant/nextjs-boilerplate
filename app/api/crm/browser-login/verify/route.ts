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
  console.log("[VERIFY-STATUS] Check");

  try {
    if (!(await validateAdmin(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { modelId } = body;

    if (!modelId) {
      return NextResponse.json(
        { status: "error", error: "Missing modelId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: session, error } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .maybeSingle();

    if (error || !session) {
      console.log("[VERIFY-STATUS] No session");
      return NextResponse.json(
        {
          status: "waiting",
          verified: false,
          message: "Session not started",
        },
        { status: 200 }
      );
    }

    // ⚠️ ONLY return status - do NOT auto-verify
    // User must manually click button to confirm
    if (session.is_active) {
      console.log("[VERIFY-STATUS] Already confirmed");
      return NextResponse.json(
        {
          status: "success",
          verified: true,
          message: "User confirmed",
        },
        { status: 200 }
      );
    }

    // Waiting for user to confirm
    console.log("[VERIFY-STATUS] Waiting for user confirmation");
    return NextResponse.json(
      {
        status: "waiting",
        verified: false,
        message: "Please confirm after login",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[VERIFY-STATUS] Error:", err?.message);
    return NextResponse.json(
      { status: "error", error: err?.message },
      { status: 500 }
    );
  }
}
