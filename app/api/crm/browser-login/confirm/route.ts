import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  console.log("[CONFIRM-LOGIN] User clicked confirmation button");

  try {
    const body = await req.json();
    const { modelId, sessionId } = body;

    if (!modelId || !sessionId) {
      return NextResponse.json(
        { status: "error", error: "Missing modelId or sessionId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current session and verify sessionId matches
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("[CONFIRM-LOGIN] ❌ No session found");
      return NextResponse.json(
        { status: "error", error: "No browser session found" },
        { status: 404 }
      );
    }

    if (session.is_active) {
      console.log("[CONFIRM-LOGIN] Already confirmed");
      return NextResponse.json(
        {
          status: "success",
          message: "Already confirmed",
          modelId,
        },
        { status: 200 }
      );
    }

    // ✅ CONFIRM: Set is_active = true (user clicked button = user confirmed login)
    console.log("[CONFIRM-LOGIN] ✅ Confirming login for:", modelId);

    const { error: updateError } = await supabase
      .from("crm_model_sessions")
      .update({
        is_active: true,
        last_verified_at: new Date().toISOString(),
        auth_cookies: {
          ...(session.auth_cookies || {}),
          verification_status: "confirmed_by_user",
          confirmed_at: new Date().toISOString(),
        },
      })
      .eq("model_id", modelId)
      .eq("id", sessionId);

    if (updateError) {
      console.error("[CONFIRM-LOGIN] ❌ Update failed:", updateError.message);
      return NextResponse.json(
        { status: "error", error: "Failed to confirm session" },
        { status: 500 }
      );
    }

    console.log("[CONFIRM-LOGIN] ✅ Login confirmed, is_active = true");

    return NextResponse.json(
      {
        status: "success",
        confirmed: true,
        message: "Login confirmed. Session is now active.",
        modelId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[CONFIRM-LOGIN] Error:", err?.message);
    return NextResponse.json(
      { status: "error", error: err?.message },
      { status: 500 }
    );
  }
}
