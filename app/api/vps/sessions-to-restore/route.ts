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
    // Deliberately not filtering on auth_cookies here (was `.not("auth_cookies",
    // "is", null)`) - the VPS's own on-disk Chrome profile is now the primary
    // restore path (survives a `systemctl restart`, unlike a fresh Supabase-
    // cookie injection which turned out to trigger extra OnlyFans verification
    // hops), and auth_cookies is only a fallback for the rare case that disk
    // didn't survive (an actual VM reboot). Every is_active model is worth an
    // attempt regardless of whether that fallback happens to be populated.
    const { data, error } = await supabase.from("crm_model_sessions").select("model_id, auth_cookies").eq("is_active", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sessions = (data || []).map((row) => ({ modelId: row.model_id, cookies: row.auth_cookies || null }));

    return NextResponse.json({ status: "success", sessions });
  } catch (error: any) {
    console.error("[SESSIONS-TO-RESTORE] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
