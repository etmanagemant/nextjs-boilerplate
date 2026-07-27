import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Called directly from inside the real OnlyFans page (the injected
// spend-ring overlay script, running in onlyfans.com's own origin) - same
// CORS setup as log-sent-message, no session cookie available there.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://onlyfans.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Computes what the spend-ring overlay should show for each fan currently
 * visible in the OnlyFans chat list: the real amount once known, "NEW" for
 * a fan OnlyFans itself just flagged as new (bounded to 24h so it doesn't
 * stay "NEW" forever), or "0" otherwise.
 * POST Body: { modelId, fanIds: string[], newFanIds: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const { modelId, fanIds, newFanIds } = await req.json();
    if (!modelId || !Array.isArray(fanIds)) {
      return NextResponse.json(
        { error: "Missing modelId or fanIds" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const newSet = new Set<string>(Array.isArray(newFanIds) ? newFanIds.map(String) : []);

    // Service-role client: this route has no logged-in user (called from
    // onlyfans.com's own origin), and needs to both read every visible
    // fan's row and upsert first_seen_new_at the first time a fan shows up
    // flagged "NEUE" - regular RLS (chatter_id = auth.uid()) would block
    // both for an anonymous caller.
    const supabase = createSupabaseAdminClient();

    const { data: rows, error } = await supabase
      .from("crm_fan_metadata")
      .select("fan_id, lifetime_value, first_seen_new_at")
      .eq("model_id", modelId)
      .in("fan_id", fanIds.map(String));
    if (error) throw error;

    const rowByFan = new Map((rows || []).map((r: any) => [r.fan_id, r]));
    const now = Date.now();
    const toInsertFirstSeen: string[] = [];
    const display: Record<string, string> = {};

    for (const fanId of fanIds.map(String)) {
      const row = rowByFan.get(fanId);
      const spend = Number(row?.lifetime_value || 0);

      if (spend > 0) {
        display[fanId] = spend.toFixed(0);
        continue;
      }

      const isFlaggedNew = newSet.has(fanId);
      const firstSeenNewAt = row?.first_seen_new_at ? new Date(row.first_seen_new_at).getTime() : null;

      if (isFlaggedNew && !firstSeenNewAt) {
        // First time we've ever seen this fan flagged "NEUE" - record it now
        // so the 24h window starts from here regardless of how long
        // OnlyFans' own badge happens to stick around.
        toInsertFirstSeen.push(fanId);
        display[fanId] = "NEW";
      } else if (firstSeenNewAt && now - firstSeenNewAt < NEW_WINDOW_MS) {
        display[fanId] = "NEW";
      } else {
        display[fanId] = "0";
      }
    }

    if (toInsertFirstSeen.length > 0) {
      const nowIso = new Date().toISOString();
      await supabase.from("crm_fan_metadata").upsert(
        toInsertFirstSeen.map((fanId) => ({
          model_id: modelId,
          fan_id: fanId,
          first_seen_new_at: nowIso,
        })),
        { onConflict: "model_id,fan_id", ignoreDuplicates: false }
      );
    }

    return NextResponse.json({ status: "success", display }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error("[FAN-SPEND-OVERLAY] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to compute fan spend overlay" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
