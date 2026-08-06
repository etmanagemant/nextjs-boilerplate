import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_USER_ID = "35498c92-2c4d-4720-a6f7-cc187a4c5fc4";

/**
 * Called periodically by the VPS (syncOnlyFansRevenue in vps-server.js),
 * same server-to-server ?secret= pattern as /api/vps/sync-fan-spend.
 *
 * Real fix for a structural gap (found 2026-08-06): a PPV/tip purchase on
 * OnlyFans never landed in chatter_revenues at all - the Dashboard's
 * OnlyFans numbers were always $0, only Stripchat (manually entered per
 * shift) ever populated real money. The old /api/crm/revenue-interceptor
 * concept (see REVENUE_INTERCEPTOR_DOCS.md) was never actually built - no
 * route file existed, and its chatter-lookup table (crm_chat_logs) was
 * never created either.
 *
 * This pulls real transactions from /api2/v2/payouts/transactions (id,
 * amount, net, createdAt, fan id - CONFIRMED LIVE 2026-08-06) and attributes
 * each one to a chatter via crm_onlyfans_sent_log (the same table the
 * "gesendet von" chat overlay already reads/writes) - the most recent
 * chatter who sent that fan a message before the purchase timestamp gets
 * credited, same resolution as /api/crm/ppv-purchased already does for
 * notifications. No match found -> falls into the existing "Offene
 * Einnahmen" pool on the Dashboard (assigned_to_chatter:false, same UI
 * already used for that), an admin assigns it by hand.
 *
 * transaction_id has a UNIQUE index (see CHATTER_REVENUES_MIGRATION.sql -
 * run it in Supabase's SQL editor first if it hasn't been already) so
 * re-syncing the same recent transactions every cycle is safe - already-
 * ASSIGNED rows are just skipped, never duplicated. Still-unassigned rows
 * (fell into the "Offene Einnahmen" pool because nobody had reacted yet)
 * get a fresh attribution attempt every cycle and are upgraded in place
 * once one succeeds - see the TIP attribution note below for why this
 * retry matters.
 *
 * Attribution differs by type (explicit ask, 2026-08-06): a PPV is
 * something a chatter actively SENT, so credit goes to whoever sent it
 * (most recent crm_onlyfans_sent_log entry BEFORE the purchase). A tip is
 * unprompted from the fan - credit instead goes to whichever chatter
 * reacts to it FIRST afterwards, by replying OR by liking it (see
 * /api/crm/of-inbox/message-like, which now also logs a like into the
 * same table as a synthetic `like:<messageId>` entry). That's why a tip
 * from the last sync cycle with no reaction yet stays unassigned instead
 * of guessing - the retry above picks it up correctly once someone reacts.
 *
 * Also fires the resolved chatter's own crm_notifications bell (2026-08-06,
 * explicit ask) - replaces /api/crm/ppv-purchased's old VNC-injected
 * detector as the trigger for that same personal notification, since that
 * detector only ever runs if someone happens to have the live VNC view of
 * this exact model open at the moment of purchase (unreliable, arrives for
 * whoever's watching, not necessarily the chatter who gets the credit).
 * This runs unconditionally every sync cycle instead, so it fires no
 * matter who's online.
 * POST /api/vps/sync-revenue?secret=YOUR_SECRET
 * Body: { modelId, transactions: [{ id, amount, net, createdAt, type: "ppv_unlock"|"tip", fanId }] }
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { modelId, transactions } = await request.json();
    if (!modelId || !Array.isArray(transactions) || !transactions.length) {
      return NextResponse.json({ status: "success", inserted: 0 });
    }

    const supabase = createSupabaseAdminClient();

    const ids = transactions.map((t: any) => String(t.id)).filter(Boolean);
    const { data: existing } = await supabase
      .from("chatter_revenues")
      .select("transaction_id, assigned_to_chatter")
      .in("transaction_id", ids);
    const existingById = new Map((existing || []).map((r: any) => [r.transaction_id, r]));

    // Already-assigned rows are final - only brand-new transactions and
    // still-unassigned ones (retry candidates) go through attribution.
    const txnsToProcess = transactions.filter((t: any) => {
      const row = t.id ? existingById.get(String(t.id)) : undefined;
      return t.id && (!row || !row.assigned_to_chatter);
    });
    if (!txnsToProcess.length) {
      return NextResponse.json({ status: "success", inserted: 0 });
    }

    async function resolveChatter(fanId: string, createdAt: string, isTip: boolean): Promise<string | null> {
      let query = supabase
        .from("crm_onlyfans_sent_log")
        .select("chatter_name")
        .eq("model_id", modelId)
        .eq("fan_id", fanId);
      query = isTip
        ? query.gte("sent_at", createdAt).order("sent_at", { ascending: true })
        : query.lte("sent_at", createdAt).order("sent_at", { ascending: false });
      const { data: sentLogEntry } = await query.limit(1).maybeSingle();
      if (!sentLogEntry?.chatter_name) return null;
      const { data: chatterProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .or(`full_name.eq.${sentLogEntry.chatter_name},email.eq.${sentLogEntry.chatter_name}`)
        .limit(1)
        .maybeSingle();
      return chatterProfile?.user_id || null;
    }

    const newRows = [];
    const upgradeRows: { transactionId: string; userId: string }[] = [];
    const notifyUserIds: { userId: string; type: "tip" | "ppv_unlock"; amount: number }[] = [];

    for (const t of txnsToProcess) {
      const transactionType = t.type === "tip" ? "tip" : "ppv_unlock";
      const resolvedUserId = t.fanId ? await resolveChatter(String(t.fanId), t.createdAt, transactionType === "tip") : null;
      const alreadyExists = existingById.has(String(t.id));

      if (alreadyExists) {
        if (resolvedUserId) upgradeRows.push({ transactionId: String(t.id), userId: resolvedUserId });
      } else {
        newRows.push({
          user_id: resolvedUserId || ADMIN_USER_ID,
          model_id: modelId,
          gross_amount: Number(t.amount) || 0,
          amount: Number(t.net) || 0,
          platform: "onlyfans",
          transaction_id: String(t.id),
          transaction_type: transactionType,
          assigned_to_chatter: !!resolvedUserId,
          chatter_found: !!resolvedUserId,
          created_at: t.createdAt || new Date().toISOString(),
        });
      }
      if (resolvedUserId) {
        notifyUserIds.push({ userId: resolvedUserId, type: transactionType, amount: Number(t.amount) || 0 });
      }
    }

    if (newRows.length > 0) {
      const { error } = await supabase.from("chatter_revenues").insert(newRows);
      if (error) {
        console.error("[SYNC-REVENUE] Insert error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    for (const u of upgradeRows) {
      const { error } = await supabase
        .from("chatter_revenues")
        .update({ user_id: u.userId, assigned_to_chatter: true, chatter_found: true })
        .eq("transaction_id", u.transactionId);
      if (error) console.error("[SYNC-REVENUE] Upgrade error:", error.message);
    }

    if (notifyUserIds.length > 0) {
      const { data: modelRow } = await supabase.from("models").select("name").eq("id", modelId).maybeSingle();
      const modelName = modelRow?.name || "ein Model";
      const notifRows = notifyUserIds.map((n) => ({
        message: n.type === "tip"
          ? `💰 Tip erhalten: $${n.amount} bei ${modelName}!`
          : `💰 Dein PPV bei ${modelName} wurde gekauft ($${n.amount})!`,
        model_id: modelId,
        recipient_user_id: n.userId,
        type: "ppv_purchased",
      }));
      const { error: notifError } = await supabase.from("crm_notifications").insert(notifRows);
      if (notifError) console.error("[SYNC-REVENUE] Notification insert error:", notifError.message);
    }

    return NextResponse.json({ status: "success", inserted: newRows.length, upgraded: upgradeRows.length });
  } catch (error: any) {
    console.error("[SYNC-REVENUE] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to sync revenue" }, { status: 500 });
  }
}
