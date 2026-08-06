import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_USER_ID = "35498c92-2c4d-4720-a6f7-cc187a4c5fc4";
// Testmodel dient nur zum gefahrlosen Live-Pruefen neuer OnlyFans-Endpunkte
// (siehe HANDOFF_NOTES.md) - erzeugt keinen echten Umsatz und soll nirgends
// in echten Auswertungen auftauchen.
const TEST_MODEL_ID = "d7976e92-434e-488a-8ec4-bba92eb31dcf";
const PERIODS = 12;

function isAdminTier(user: { id: string; email?: string | null }, profile: any) {
  return (
    user.id === ADMIN_USER_ID ||
    user.email === "etmanagement@gmail.com" ||
    user.email === "etmanagemant@gmail.com" ||
    profile?.role === "admin" ||
    profile?.role === "content-manager"
  );
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}
function isoWeekLabel(d: Date) {
  // ISO week number - Donnerstag der Woche bestimmt das Jahr.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `KW${week}`;
}
function dayLabel(d: Date) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/**
 * Aggregierte Umsatz-Zeitreihe fuer den neuen Dashboard-Chart (2026-08-07,
 * ersetzt die reine "heute"-Kachel). Chatter duerfen nur ihre eigene
 * userId anfragen, Admin darf jede oder gar keine (= Agentur-Gesamt).
 * Aggregation laeuft in JS statt SQL GROUP BY - bei der aktuellen
 * Datenmenge (paar hundert Zeilen) kein Problem, kein RPC noetig.
 * GET ?granularity=month|week|custom&offset=0&userId=X&start=&end=
 */
export async function GET(req: NextRequest) {
  const { user } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getCurrentProfile(user.id);
  const adminTier = isAdminTier(user, profile);

  const { searchParams } = new URL(req.url);
  const granularityParam = searchParams.get("granularity");
  const granularity =
    granularityParam === "week" ? "week" : granularityParam === "day" ? "day" : granularityParam === "custom" ? "custom" : "month";
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const requestedUserId = searchParams.get("userId");

  // Chatter darf nur die eigene ID sehen - egal was im Query steht.
  const targetUserId = adminTier ? requestedUserId || null : user.id;

  const supabase = createSupabaseAdminClient();

  let bucketStarts: Date[] = [];
  let bucketEnd: Date;
  let labelFn: (d: Date) => string;

  if (granularity === "custom") {
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    if (!startParam || !endParam) return NextResponse.json({ error: "Missing start/end" }, { status: 400 });
    const start = new Date(startParam + "T00:00:00");
    const end = new Date(endParam + "T23:59:59");
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: "Invalid start/end" }, { status: 400 });
    }
    const spanDays = (end.getTime() - start.getTime()) / 86400000;
    const byDay = spanDays <= 45;
    labelFn = byDay ? dayLabel : isoWeekLabel;
    let cursor = new Date(start);
    while (cursor <= end) {
      bucketStarts.push(new Date(cursor));
      cursor = byDay ? new Date(cursor.getTime() + 86400000) : new Date(cursor.getTime() + 7 * 86400000);
    }
    bucketEnd = end;
  } else if (granularity === "day") {
    // Explizit gewuenscht (2026-08-07): "Tage" = letzte 7 Tage, nicht 12 -
    // eigene Bucket-Anzahl statt der PERIODS-Konstante der anderen Modi.
    const DAY_PERIODS = 7;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const newestBucketStart = new Date(now.getTime() - offset * DAY_PERIODS * 86400000);
    for (let i = DAY_PERIODS - 1; i >= 0; i--) {
      bucketStarts.push(new Date(newestBucketStart.getTime() - i * 86400000));
    }
    bucketEnd = new Date(newestBucketStart.getTime() + 86400000);
    labelFn = dayLabel;
  } else if (granularity === "week") {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dayOfWeek = now.getDay() || 7;
    const thisMonday = new Date(now.getTime() - (dayOfWeek - 1) * 86400000);
    const newestBucketStart = new Date(thisMonday.getTime() - offset * PERIODS * 7 * 86400000);
    for (let i = PERIODS - 1; i >= 0; i--) {
      bucketStarts.push(new Date(newestBucketStart.getTime() - i * 7 * 86400000));
    }
    bucketEnd = new Date(newestBucketStart.getTime() + 7 * 86400000 - 1000);
    labelFn = isoWeekLabel;
  } else {
    const now = new Date();
    const newestBucketMonth = now.getMonth() - offset * PERIODS;
    const newestBucketYear = now.getFullYear() + Math.floor(newestBucketMonth / 12);
    const normalizedMonth = ((newestBucketMonth % 12) + 12) % 12;
    for (let i = PERIODS - 1; i >= 0; i--) {
      const m = normalizedMonth - i;
      bucketStarts.push(new Date(newestBucketYear, m, 1));
    }
    bucketEnd = new Date(newestBucketYear, normalizedMonth + 1, 1);
    labelFn = monthLabel;
  }

  const rangeStart = bucketStarts[0];
  let query = supabase
    .from("chatter_revenues")
    .select("amount, gross_amount, created_at, user_id")
    .gte("created_at", rangeStart.toISOString())
    .lt("created_at", bucketEnd.toISOString())
    .neq("model_id", TEST_MODEL_ID);
  if (targetUserId) query = query.eq("user_id", targetUserId);
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bucketEnds = bucketStarts.map((s, i) => (i + 1 < bucketStarts.length ? bucketStarts[i + 1] : bucketEnd));
  const buckets = bucketStarts.map((s, i) => ({ label: labelFn(s), start: s.toISOString(), gross: 0, net: 0 }));

  for (const r of rows || []) {
    const t = new Date(r.created_at).getTime();
    for (let i = 0; i < bucketStarts.length; i++) {
      if (t >= bucketStarts[i].getTime() && t < bucketEnds[i].getTime()) {
        buckets[i].gross += Number(r.gross_amount || r.amount || 0);
        buckets[i].net += Number(r.amount || 0);
        break;
      }
    }
  }

  return NextResponse.json({ buckets, isAgencyTotal: adminTier && !targetUserId });
}
