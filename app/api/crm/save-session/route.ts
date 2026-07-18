import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Admin-only check
    if (!user || user.id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4") {
      return NextResponse.json(
        { error: "Unauthorized - admin only" },
        { status: 403 }
      );
    }

    const { modelId, authCookies } = await req.json();

    if (!modelId || !authCookies) {
      return NextResponse.json(
        { error: "Missing modelId or authCookies" },
        { status: 400 }
      );
    }

    // Upsert into crm_model_sessions
    const { error, data } = await supabase
      .from("crm_model_sessions")
      .upsert(
        {
          model_id: modelId,
          is_active: true,
          auth_cookies: authCookies,
          last_verified_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "model_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("[SAVE-SESSION] Error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session: data,
      message: `Model ${modelId} saved successfully`,
    });
  } catch (err: any) {
    console.error("[SAVE-SESSION] Exception:", err.message);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
