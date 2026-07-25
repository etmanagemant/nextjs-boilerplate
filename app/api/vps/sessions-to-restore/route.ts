import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Called once by the VPS right after it boots (see autoReconnectAllModels
 * in vps-server.js) to learn which models it should try to silently
 * restore from stored cookies, instead of every restart leaving the CRM
 * Inbox stuck until a human manually reconnects.
 * GET /api/vps/sessions-to-restore?secret=YOUR_SECRET
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("crm_model_sessions")
      .select("model_id, auth_cookies")
      .eq("is_active", true)
      .not("auth_cookies", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sessions = (data || [])
      .filter((row) => row.auth_cookies && Object.keys(row.auth_cookies).length > 0)
      .map((row) => ({ modelId: row.model_id, cookies: row.auth_cookies }));

    return NextResponse.json({ status: "success", sessions });
  } catch (error: any) {
    console.error("[SESSIONS-TO-RESTORE] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
