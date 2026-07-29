import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Called periodically by the VPS itself (Node-side, driving the model's own
 * page - see syncFanLifetimeSpend in vps-server.js), not from inside the
 * OnlyFans page, so this uses the same server-to-server ?secret= pattern as
 * the other /api/vps/* routes rather than CORS.
 *
 * Syncs OnlyFans' own per-fan lifetime-spend total (the "Gesamt" figure on
 * /my/collections/user-lists/subscribers/activity - OnlyFans' own maintained
 * sum of subscription+tips+PPV for that fan) into crm_fan_metadata.
 * lifetime_value. Unlike the live PPV-unlock detector (/api/crm/ppv-
 * purchased), this covers a fan's FULL history immediately, not just
 * purchases caught live from here on, and includes tips, which the live
 * detector never covered at all. Both can coexist safely - this periodic
 * sync just overwrites lifetime_value with the true total each cycle,
 * correcting/backfilling anything the live detector missed.
 * POST /api/vps/sync-fan-spend?secret=YOUR_SECRET  Body: { modelId, fans: [{ fanId, lifetimeValue }] }
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { modelId, fans } = await request.json();
    if (!modelId || !Array.isArray(fans) || !fans.length) {
      return NextResponse.json({ status: "success", updated: 0 });
    }

    const rows = fans
      .filter((f: any) => f && f.fanId && Number.isFinite(Number(f.lifetimeValue)))
      .map((f: any) => ({
        model_id: modelId,
        fan_id: String(f.fanId),
        lifetime_value: Number(f.lifetimeValue),
      }));
    if (!rows.length) {
      return NextResponse.json({ status: "success", updated: 0 });
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("crm_fan_metadata").upsert(rows, { onConflict: "model_id,fan_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: "success", updated: rows.length });
  } catch (error: any) {
    console.error("[SYNC-FAN-SPEND] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to sync fan spend" }, { status: 500 });
  }
}
