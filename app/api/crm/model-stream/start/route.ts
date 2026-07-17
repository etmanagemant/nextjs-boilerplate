import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Get OnlyFans session data for a model
 * POST /api/crm/model-open
 * Body: { modelId: string }
 * 
 * Returns cookies + OnlyFans URL to open in Iframe
 */
export async function POST(request: NextRequest) {
  console.log("[MODEL-OPEN] ===== STARTED =====");
  
  try {
    const body = await request.json();
    const { modelId } = body;

    if (!modelId) {
      console.error("[MODEL-OPEN] ❌ Missing modelId");
      return NextResponse.json(
        { error: "Missing modelId" },
        { status: 400 }
      );
    }

    console.log("[MODEL-OPEN] ✅ Fetching session for model:", modelId);
    const supabase = createSupabaseAdminClient();

    // Get active session for this model
    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("*")
      .eq("model_id", modelId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("[MODEL-OPEN] ❌ No active session found");
      return NextResponse.json(
        { error: "No active session for this model" },
        { status: 404 }
      );
    }

    console.log("[MODEL-OPEN] ✅ Session found");

    const authCookies = session.auth_cookies;

    if (!authCookies) {
      console.error("[MODEL-OPEN] ❌ No auth cookies found");
      return NextResponse.json(
        { error: "No authentication cookies stored" },
        { status: 400 }
      );
    }

    console.log("[MODEL-OPEN] ✅ Returning session data");

    // Return cookies to frontend so it can set them in Iframe
    return NextResponse.json(
      {
        status: "success",
        modelId: modelId,
        cookies: authCookies.cookies || authCookies, // Handle both formats
        onlyFansUrl: "https://onlyfans.com/inbox",
        sessionValid: true,
      },
      { status: 200 }
    );

  } catch (err: any) {
    console.error("[MODEL-OPEN] ❌ Error:", err?.message);
    return NextResponse.json(
      { status: "error", error: err?.message },
      { status: 500 }
    );
  }
}
