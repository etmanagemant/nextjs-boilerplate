import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    return false;
  }
}

export async function POST(req: NextRequest) {
  console.log("[VERIFY] Start");
  
  try {
    const isAdmin = await validateAdmin(req);
    if (!isAdmin) {
      console.error("[VERIFY] Not admin");
      return NextResponse.json(
        { status: "error", error: "Unauthorized", verified: false },
        { status: 403 }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[VERIFY] JSON parse failed");
      return NextResponse.json(
        { status: "error", error: "Invalid JSON", verified: false },
        { status: 400 }
      );
    }

    const { modelId } = body;
    if (!modelId) {
      console.error("[VERIFY] No modelId");
      return NextResponse.json(
        { status: "error", error: "Missing modelId", verified: false },
        { status: 400 }
      );
    }

    console.log("[VERIFY] Checking modelId:", modelId);

    const supabase = await createClient();
    const { data: session, error } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .maybeSingle();

    if (error || !session) {
      console.log("[VERIFY] No session found yet");
      return NextResponse.json(
        { status: "waiting", verified: false, message: "Waiting for session" },
        { status: 200 }
      );
    }

    console.log("[VERIFY] Session found, is_active:", session.is_active);

    // Get elapsed time
    const cookies = session.auth_cookies || {};
    const createdAt = cookies.created_at ? new Date(cookies.created_at).getTime() : 0;
    const elapsed = createdAt ? Date.now() - createdAt : 0;
    const MIN_WAIT = 5000; // 5 seconds

    console.log("[VERIFY] Elapsed:", elapsed, "ms, min:", MIN_WAIT, "ms");

    // If already active → verified
    if (session.is_active) {
      console.log("[VERIFY] Already active");
      return NextResponse.json(
        { status: "success", verified: true, message: "Already verified" },
        { status: 200 }
      );
    }

    // If min time passed → mark as verified
    if (elapsed >= MIN_WAIT) {
      console.log("[VERIFY] Min time passed, marking verified");

      const { error: updateError } = await supabase
        .from("crm_model_sessions")
        .update({
          is_active: true,
          last_verified_at: new Date().toISOString(),
          auth_cookies: {
            ...cookies,
            verification_status: "verified",
            verified_at: new Date().toISOString(),
          },
        })
        .eq("model_id", modelId);

      if (updateError) {
        console.error("[VERIFY] Update failed:", updateError.message);
        return NextResponse.json(
          { status: "error", error: "Update failed", verified: false },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { status: "success", verified: true, message: "Verified", modelId },
        { status: 200 }
      );
    }

    // Still waiting
    const remaining = MIN_WAIT - elapsed;
    console.log("[VERIFY] Still waiting, remaining:", Math.ceil(remaining / 1000), "s");
    return NextResponse.json(
      {
        status: "waiting",
        verified: false,
        elapsed,
        message: `Wait ${Math.ceil(remaining / 1000)}s more`,
      },
      { status: 200 }
    );

  } catch (err: any) {
    console.error("[VERIFY] Error:", err?.message);
    return NextResponse.json(
      { status: "error", error: err?.message, verified: false },
      { status: 500 }
    );
  }
}
