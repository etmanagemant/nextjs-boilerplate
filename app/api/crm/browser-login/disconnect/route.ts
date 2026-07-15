import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  console.log("[DISCONNECT] User clicked disconnect");

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

    // Get current session
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("[DISCONNECT] No session found");
      return NextResponse.json(
        { status: "error", error: "Session not found" },
        { status: 404 }
      );
    }

    // ✅ DISCONNECT: Set is_active = false
    console.log("[DISCONNECT] Disconnecting session for:", modelId);

    const { error: updateError } = await supabase
      .from("crm_model_sessions")
      .update({
        is_active: false,
        last_verified_at: new Date().toISOString(),
        auth_cookies: {
          ...(session.auth_cookies || {}),
          disconnected_at: new Date().toISOString(),
          disconnected_reason: "user_initiated",
        },
      })
      .eq("model_id", modelId)
      .eq("id", sessionId);

    if (updateError) {
      console.error("[DISCONNECT] Update failed:", updateError.message);
      return NextResponse.json(
        { status: "error", error: "Failed to disconnect session" },
        { status: 500 }
      );
    }

    console.log("[DISCONNECT] ✅ Session disconnected");
    return NextResponse.json(
      {
        status: "success",
        disconnected: true,
        message: "Session disconnected successfully",
        modelId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[DISCONNECT] Error:", err?.message);
    return NextResponse.json(
      { status: "error", error: err?.message },
      { status: 500 }
    );
  }
}
