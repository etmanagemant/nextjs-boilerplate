import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Called by the VPS's boot-time auto-reconnect pass when a model's stored
 * cookies turned out to be expired/invalid, so Supabase (and therefore the
 * Connection Hub UI) stops showing it as connected. Without this, is_active
 * would stay stuck true from the last successful login while the VPS itself
 * has no live session at all - a silent lie the admin has no way to notice
 * until a chatter reports a broken chat.
 * POST /api/vps/mark-session-invalid?secret=YOUR_SECRET  Body: { modelId }
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { modelId } = await request.json();
    if (!modelId) {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("crm_model_sessions")
      .update({
        is_active: false,
        auth_cookies: null,
        last_verified_at: new Date().toISOString(),
      })
      .eq("model_id", modelId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: "success", modelId });
  } catch (error: any) {
    console.error("[MARK-SESSION-INVALID] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
