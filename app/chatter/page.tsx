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
  models?: { name: string } | null;
};

function toDurationHours(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  return diffMs / (1000 * 60 * 60);
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const calc = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      setSeconds(diff);
    };
    calc();
    const interval = setInterval(() => setSeconds(p => p + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded ml-2">
      ⏱️ {pad(hrs)}:{pad(mins)}:{pad(secs)}
    </span>
  );
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
    if (!currentUserId) return;
    const { data, error } = await supabase
      .from("shift_assignments")
      .select("id, shift_id, chatter_id, model_id, started_at, ended_at, models(name)")
      .eq("chatter_id", currentUserId)
      .order("id", { ascending: false })
      .limit(50);

    if (error) { setErr(error.message); return; }
    setRows((data ?? []) as any[]);
  }, [supabase, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    let isMounted = true;
    (async () => {
      setLoading(true); setErr(null);
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("id, shift_id, chatter_id, model_id, started_at, ended_at, models(name)")
        .eq("chatter_id", currentUserId)
        .order("id", { ascending: false })
        .limit(50);

      if (!isMounted) return;
      if (error) { setErr(error.message); setRows([]); setLoading(false); return; }
      setRows((data ?? []) as any[]);
      setLoading(false);
    })();
    return () => { isMounted = false; };
  }, [supabase, currentUserId]);

  const totalHours = useMemo(() => {
    return rows.reduce((sum, r) => sum + toDurationHours(r.started_at, r.ended_at), 0);
  }, [rows]);

  const activeShift = useMemo(() => {
    return rows.find(r => r.started_at && !r.ended_at);
  }, [rows]);
  async function triggerGlobalStart() {
    if (!currentUserId) {
      setErr("Benutzerdaten werden noch geladen. Bitte kurz warten.");
      return;
    }
    setErr(null);

    const heuteISO = new Date().toISOString().split("T")[0];
    const nun = new Date().toISOString();

    // 1. Versuche geplante Models aus dem Kalender zu lesen
    const { data: kalenderSchichten } = await supabase
      .from("shifts")
      .select("*")
      .eq("shift_date", heuteISO);

    const meineGeplantenModels: string[] = [];
    (kalenderSchichten || []).forEach((schicht) => {
      try {
        if (schicht.notes && schicht.notes.startsWith("{")) {
          const parsed = JSON.parse(schicht.notes);
          if (parsed.mitarbeiter === currentUserEmail && parsed.model) {
            meineGeplantenModels.push(parsed.model);
          }
        }
      } catch (e) {}
    });

    // 2. Wenn Models geplant sind, hole deren IDs. Wenn NICHT, erstelle eine freie Schicht!
    if (meineGeplantenModels.length > 0) {
      const { data: dbModels } = await supabase
        .from("models")
        .select("id, name")
        .in("name", meineGeplantenModels);

      if (dbModels && dbModels.length > 0) {
        const eintraegeliste = dbModels.map((m) => ({
          chatter_id: currentUserId,
          model_id: m.id,
          started_at: nun,
          ended_at: null
        }));
        await supabase.from("shift_assignments").insert(eintraegeliste);
        await refresh();
        return;
      }
    }

    // FALLBACK (Immer-Erlaubt-Start): Keine Schicht geplant -> Stemple als freie Arbeitszeit ein!
    const { error: freeError } = await supabase.from("shift_assignments").insert([
      {
        chatter_id: currentUserId,
        model_id: null,
        started_at: nun,
        ended_at: null
      }
    ]);

    if (freeError) { setErr(freeError.message); return; }
    await refresh();
  }

  async function triggerGlobalEnd() {
    if (!activeShift) { setErr("Keine aktive Schicht zum Beenden gefunden."); return; }
    setErr(null);
    
    const { error } = await supabase
      .from("shift_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("chatter_id", currentUserId)
      .is("ended_at", null);

    if (error) { setErr(error.message); return; }
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
        {activeShift && activeShift.started_at && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 font-medium animate-pulse ml-2">● Schicht läuft aktiv...</span>
            <LiveTimer startedAt={activeShift.started_at} />
          </div>
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
              const modelName = r.models?.name || "Freie Arbeitszeit (Kein Model)";

              return (
                <div key={r.id} className={`rounded border p-4 bg-black/20 ${isLaufend ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-200">
                      Schicht #{r.id} {isLaufend && <span className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Aktiv</span>}
                    </div>
                    <div className="text-sm font-semibold text-slate-300">{hours.toFixed(2)} h</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/60 border-t border-white/5 pt-2">
                    <div><span className="text-white/40">Nutzer:</span> <span className="text-blue-400 font-medium">{currentUserEmail || "Dein Account"}</span></div>
                    <div><span className="text-white/40">Zugeordnetes Model:</span> <span className="text-amber-400 font-semibold">{modelName}</span></div>
                    <div><span className="text-white/40">Beginn:</span> {r.started_at ? new Date(r.started_at).toLocaleString('de-DE') : "—"}</div>
                    <div><span className="text-white/40">Ende:</span> {r.ended_at ? new Date(r.ended_at).toLocaleString('de-DE') : "—"}</div>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <div className="text-sm text-slate-500 py-4 italic text-center border border-white/5 rounded bg-black/10">Noch keine Schichten erfasst.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
