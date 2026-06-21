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

type GeplanteSchicht = {
  id: number;
  datum: string;
  von: string; // "12:00"
  bis: string; // "16:00"
  model: string;
  nachricht: string;
};

function pad2(n: number) { return String(n).padStart(2, "0"); }

function getHeuteISOString() {
  const d = new Date();
  const options = { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" } as const;
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(d);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function toDurationHours(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, end - start) / (1000 * 60 * 60);
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const calc = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return (
    <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded ml-2">
      ⏱️ {pad2(hrs)}:{pad2(mins)}:{pad2(secs)}
    </span>
  );
}
export default function ChatterPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [alleKalenderSchichten, setAlleKalenderSchichten] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserFullName, setCurrentUserFullName] = useState<string>("");
  const [copiedShiftId, setCopiedShiftId] = useState<number | null>(null);
  const [jetztZeit, setJetztZeit] = useState("");

  // Live-Uhrzeit für den sekundengenauen Model-Wechsel im UI aktualisieren
  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      setJetztZeit(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        setCurrentUserEmail(data.user.email || "");
        setCurrentUserId(data.user.id);
        const { data: prof } = await supabase.from("profiles").select("full_name").eq("user_id", data.user.id).maybeSingle();
        if (prof?.full_name) setCurrentUserFullName(prof.full_name);
      }
    });
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!currentUserId) return;
    const [assignmentsRes, shiftsRes] = await Promise.all([
      supabase.from("shift_assignments").select("id, shift_id, chatter_id, model_id, started_at, ended_at").eq("chatter_id", currentUserId).order("id", { ascending: false }).limit(50),
      supabase.from("shifts").select("*")
    ]);
    if (assignmentsRes.error) { setErr(assignmentsRes.error.message); return; }
    setRows((assignmentsRes.data ?? []) as any[]);
    setAlleKalenderSchichten(shiftsRes.data ?? []);
  }, [supabase, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    setLoading(true); refresh().then(() => setLoading(false));
  }, [currentUserId, refresh]);

  const meineGeplantenSchichten = useMemo<GeplanteSchicht[]>(() => {
    const listen: GeplanteSchicht[] = [];
    alleKalenderSchichten.forEach((s) => {
      try {
        if (s.notes && s.notes.startsWith("{")) {
          const parsed = JSON.parse(s.notes);
          const kalenderMitarbeiter = String(parsed.mitarbeiter).toLowerCase().trim();
          const matchtMitarbeiter = kalenderMitarbeiter === currentUserEmail.toLowerCase().trim() || kalenderMitarbeiter === currentUserId.trim() || (currentUserFullName && kalenderMitarbeiter === currentUserFullName.toLowerCase().trim());

          if (matchtMitarbeiter) {
            listen.push({
              id: s.id,
              datum: s.shift_date || "",
              von: parsed.von || "00:00",
              bis: parsed.bis || "00:00",
              model: parsed.model || "Kein Model",
              nachricht: parsed.nachricht || ""
            });
          }
        }
      } catch (e) {}
    });
    return listen.sort((a, b) => `${a.datum}T${a.von}`.localeCompare(`${b.datum}T${b.von}`));
  }, [alleKalenderSchichten, currentUserEmail, currentUserId, currentUserFullName]);

  const naechsteZweiSchichten = useMemo(() => {
    const heuteStr = getHeuteISOString();
    return meineGeplantenSchichten.filter(s => s.datum >= heuteStr).slice(0, 2);
  }, [meineGeplantenSchichten]);

  const totalHours = useMemo(() => rows.reduce((sum, r) => sum + toDurationHours(r.started_at, r.ended_at), 0), [rows]);
  const activeShift = useMemo(() => rows.find(r => r.started_at && !r.ended_at), [rows]);
  // Rechnet live aus, welche Models JETZT GERADE in dieser Minute aktiv sind
  const aktiveLiveModels = useMemo(() => {
    const heuteStr = getHeuteISOString();
    const treffer = meineGeplantenSchichten.filter(s => s.datum === heuteStr && jetztZeit >= s.von && jetztZeit <= s.bis);
    if (treffer.length === 0) return ["Freie Arbeitszeit (Kein Model)"];
    return treffer.map(s => s.model);
  }, [meineGeplantenSchichten, jetztZeit]);

  async function triggerGlobalStart() {
    if (!currentUserId) { setErr("Benutzerdaten laden noch."); return; }
    setErr(null);
    
    // 🛡️ EINZIGARTIGER EINTRAG: Es wird immer nur EINE Schicht ohne feste Modelbindung gestempelt!
    const { error } = await supabase.from("shift_assignments").insert([
      {
        chatter_id: currentUserId,
        model_id: null, // Die Zuordnung regelt das Backend vollautomatisch über die Uhrzeit!
        started_at: new Date().toISOString(),
        ended_at: null
      }
    ]);
    if (error) { setErr(error.message); return; }
    await refresh();
  }

  async function triggerGlobalEnd() {
    if (!activeShift) { setErr("Keine aktive Schicht gefunden."); return; }
    setErr(null);
    const { error } = await supabase.from("shift_assignments").update({ ended_at: new Date().toISOString() }).eq("id", activeShift.id);
    if (error) { setErr(error.message); return; }
    await refresh();
  }

  function handleCopyMessage(text: string, id: number) {
    navigator.clipboard.writeText(text);
    setCopiedShiftId(id);
    setTimeout(() => setCopiedShiftId(null), 2000);
  }
  return (
    <div className="p-6 min-h-screen bg-slate-950 text-white">
      <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
        <h1 className="text-xl font-semibold text-white">Chatter — Stechuhr</h1>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition font-medium cursor-pointer">Abmelden (Logout)</button>
        </form>
      </div>

      <div className="bg-slate-900 border border-white/10 p-4 rounded-lg mb-6 flex gap-4 items-center flex-wrap justify-between">
        <div className="flex gap-4 items-center flex-wrap">
          <span className="text-sm text-slate-300 font-medium">Deine Stechuhr:</span>
          <button onClick={triggerGlobalStart} disabled={!!activeShift} className="rounded bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-40 font-semibold text-white transition cursor-pointer">Start Schicht</button>
          <button onClick={triggerGlobalEnd} disabled={!activeShift} className="rounded bg-red-600 px-4 py-2 text-sm hover:bg-red-700 disabled:opacity-40 font-semibold text-white transition cursor-pointer">Ende Schicht</button>
        </div>
        {activeShift && activeShift.started_at && (
          <div className="flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-xl">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Aktiv:</span>
              <span className="text-xs text-amber-400 font-bold">{aktiveLiveModels.join(", ")}</span>
            </div>
            <LiveTimer startedAt={activeShift.started_at} />
          </div>
        )}
      </div>

      <div className="mt-2 text-sm text-white/70 mb-6">
        Deine Gesamtstunden: <span className="text-white font-semibold">{totalHours.toFixed(2)} h</span>
      </div>

      {/* 📋 VORSCHAU: Die nächsten 2 Schichten nebeneinander */}
      <div className="mb-8">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Deine nächsten 2 geplanten Schichten</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {naechsteZweiSchichten.map((s) => (
            <div key={s.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between min-h-[140px]">
              <div>
                <div className="flex justify-between items-center border-b border-slate-800/80 pb-1.5 mb-2">
                  <span className="text-xs font-black text-amber-400 uppercase tracking-wide">Model: {s.model}</span>
                  <span className="text-[11px] text-slate-400 font-medium">{new Date(s.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} | {s.von} - {s.bis} Uhr</span>
                </div>
                {s.nachricht ? (
                  <p className="text-xs text-slate-400 italic line-clamp-2 bg-slate-950/40 p-2 rounded border border-slate-900/60 break-words">{s.nachricht}</p>
                ) : (
                  <p className="text-xs text-slate-500 italic p-2">Keine Mass Message hinterlegt.</p>
                )}
              </div>
              {s.nachricht && (
                <button type="button" onClick={() => handleCopyMessage(s.nachricht, s.id)} className="w-full mt-3 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded py-1 text-xs font-bold transition cursor-pointer">
                  {copiedShiftId === s.id ? "✓ Nachricht kopiert!" : "📋 Mass Message kopieren"}
                </button>
              )}
            </div>
          ))}
          {naechsteZweiSchichten.length === 0 && (
            <div className="col-span-2 text-xs text-slate-500 italic p-4 text-center border border-dashed border-slate-800 rounded-xl">Aktuell keine Schichten im Kalender geplant.</div>
          )}
        </div>
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
                    <div className="text-sm font-medium text-slate-200">Schicht #{r.id} {isLaufend && <span className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Aktiv</span>}</div>
                    <div className="text-sm font-semibold text-slate-300">{hours.toFixed(2)} h</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/60 border-t border-white/5 pt-2">
                    <div><span className="text-white/40">Nutzer:</span> <span className="text-blue-400 font-medium">{currentUserEmail}</span></div>
                    <div><span className="text-white/40">Beginn:</span> {r.started_at ? new Date(r.started_at).toLocaleString('de-DE') : "—"}</div>
                    <div><span className="text-white/40">Ende:</span> {r.ended_at ? new Date(r.ended_at).toLocaleString('de-DE') : "—"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
