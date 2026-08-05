import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-fan-detail - real OnlyFans GET /users/u{fanId}.
 * Returns listsStates[] (per-list membership, system + custom lists) and
 * subscribedOnData (real per-fan lifetime spend breakdown). CONFIRMED LIVE
 * 2026-08-01.
 * GET ?modelId=X&fanId=Y
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");
    const fanId = searchParams.get("fanId");
    if (!modelId || !fanId) return NextResponse.json({ error: "Missing modelId or fanId" }, { status: 400 });

    const vpsRes = await vpsFetch(`/of-fan-detail?modelId=${encodeURIComponent(modelId)}&fanId=${encodeURIComponent(fanId)}`);
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });

    // Best-effort: this real, live totalSumm is the true fix for the
    // long-standing "Gesamtausgaben"/spend-ring gap (crm_fan_metadata.
    // lifetime_value used to only ever get backfilled by a periodic VNC
    // DOM-scrape sync, which could lag or miss fans entirely). Every time
    // a chatter opens this fan in OF Inbox Beta, the real number gets
    // written straight back into the same cache both the FanCrmPanel
    // sidebar and the avatar spend-ring already read - self-healing
    // instead of waiting on the next scrape cycle. Never blocks the
    // response on failure.
    const totalSumm = data?.data?.subscribedOnData?.totalSumm;
    if (typeof totalSumm === "number") {
      const { error: upsertError } = await createSupabaseAdminClient()
        .from("crm_fan_metadata")
        .upsert({ model_id: modelId, fan_id: String(fanId), lifetime_value: totalSumm }, { onConflict: "model_id,fan_id" });
      if (upsertError) console.error("[OF-INBOX-FAN-DETAIL] lifetime_value upsert failed:", upsertError.message);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-FAN-DETAIL] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load fan detail" }, { status: 500 });
  }
}
