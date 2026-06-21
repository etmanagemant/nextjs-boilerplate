"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

type AssignmentRow = {
  id: number;
  shift_id: number;
  chatter_id: string;
  model_id?: number | null;
  started_at: string | null;
  ended_at: string | null;
};

function toDurationHours(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  return diffMs / (1000 * 60 * 60);
}

export default function ChatterPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserEmail(data.user.email || "");
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!currentUserEmail && !currentUserId) return;

    const { data, error } = await supabase
      .from("shift_assignments")
      .select("id, shift_id, chatter_id, model_id, started_at, ended_at")
      .or(`chatter_id.eq.${currentUserEmail},chatter_id.eq.${currentUserId}`)
      .order("id", { ascending: false })
      .limit(50);

    if (error) {
      setErr(error.message);
      return;
    }
    setRows((data ?? []) as AssignmentRow[]);
  }, [supabase, currentUserEmail, currentUserId]);

  useEffect(() => {
    if (!currentUserEmail && !currentUserId) return;
    
    let isMounted = true;
    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("shift_assignments")
        .select("id, shift_id, chatter_id, model_id, started_at, ended_at")
        .or(`chatter_id.eq.${currentUserEmail},chatter_id.eq.${currentUserId}`)
        .order("id", { ascending: false })
        .limit(50);

      if (!isMounted) return;
      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as AssignmentRow[]);
      setLoading(false);
    })();

    return () => { isMounted = false; };
  }, [supabase, currentUserEmail, currentUserId]);

  const totalHours = useMemo(() => {
    return rows.reduce((sum, r) => sum + toDurationHours(r.started_at, r.ended_at), 0);
  }, [rows]);

  const activeShift = useMemo(() => {
    return rows.find(r => r.started_at && !r.ended_at);
  }, [rows]);

  async function triggerGlobalStart() {
    if (!currentUserEmail) {
      setErr("Benutzerdaten werden noch geladen. Bitte kurz warten.");
      return;
    }
    setErr(null);
    const { error } = await supabase
      .from("shift_assignments")
      .insert([
        {
          shift_id: 1, 
          chatter_id: currentUserEmail,
          started_at: new Date().toISOString(),
          ended_at: null
        }
      ]);

    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  async function triggerGlobalEnd() {
    if (!activeShift) {
      setErr("Keine aktive Schicht zum Beenden gefunden.");
      return;
    }
    setErr(null);
    const { error } = await supabase
      .from("shift_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", activeShift.id);

    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  return (
    <div className="p-6 min-h-screen bg-slate-950 text-white">
      <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
        <h1 className="text-xl font-semibold text-white">Chatter — Stechuhr</h1>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition font-medium cursor-pointer">
            Abmelden (Logout)
          </button>
        </form>
      </div>

      <div className="bg-slate-900 border border-white/10 p-4 rounded-lg mb-6 flex gap-4 items-center flex-wrap">
        <span className="text-sm text-slate-300 font-medium">Deine Stechuhr:</span>
        <button onClick={triggerGlobalStart} disabled={!!activeShift} className="rounded bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-40 font-semibold text-white transition cursor-pointer disabled:cursor-not-allowed">
          Start Schicht
        </button>
        <button onClick={triggerGlobalEnd} disabled={!activeShift} className="rounded bg-red-600 px-4 py-2 text-sm hover:bg-red-700 disabled:opacity-40 font-semibold text-white transition cursor-pointer disabled:cursor-not-allowed">
          Ende Schicht
        </button>
        {activeShift && (
          <span className="text-xs text-emerald-400 font-medium animate-pulse ml-2">
            ● Schicht läuft gerade...
          </span>
        )}
      </div>

      <div className="mt-2 text-sm text-white/70 mb-6">
        Deine Gesamtstunden: <span className="text-white font-semibold">{totalHours.toFixed(2)} h</span>
      </div>

      {err && <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded mb-4">{err}</div>}

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-slate-300 mb-4">Deine persönliche Schichthistorie</h2>
        {loading ? (
          <div className="text-sm text-white/70">Lade deinen Verlauf…</div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const hours = toDurationHours(r.started_at, r.ended_at);
              const isLaufend = r.started_at && !r.ended_at;
              return (
                <div key={r.id} className={`rounded border p-4 bg-black/20 ${isLaufend ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-200">
                      Schicht #{r.id} {isLaufend && <span className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Aktiv</span>}
                    </div>
                    <div className="text-sm font-semibold text-slate-300">{hours.toFixed(2)} h</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/60 border-t border-white/5 pt-2">
                    <div><span className="text-white/40">Nutzer:</span> <span className="text-blue-400 font-medium">{r.chatter_id.includes("@") ? r.chatter_id : "Dein Account"}</span></div>
                    <div><span className="text-white/40">Modell-ID:</span> {r.model_id ?? "—"}</div>
                    <div><span className="text-white/40">Beginn:</span> {r.started_at ? new Date(r.started_at).toLocaleString('de-DE') : "—"}</div>
                    <div><span className="text-white/40">Ende:</span> {r.ended_at ? new Date(r.ended_at).toLocaleString('de-DE') : "—"}</div>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <div className="text-sm text-slate-500 py-4 italic text-center border border-white/5 rounded bg-black/10">Noch keine Schichten auf diesem Account erfasst.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
