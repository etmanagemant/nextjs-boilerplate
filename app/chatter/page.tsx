"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";
import ModeratorStriptchatShift from "@/components/layout/ModeratorStriptchatShift";

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
  von: string;
  bis: string;
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
  const [currentUserRole, setCurrentUserRole] = useState<string>("chatter");
  const [sichereModels, setSichereModels] = useState<any[]>([]);

  useEffect(() => {
    const calcZeit = () => {
      const d = new Date();
      setJetztZeit(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
    };
    calcZeit();
    const interval = setInterval(calcZeit, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user) {
        setCurrentUserEmail(data.user.email || "");
        const { data: prof } = await supabase.from("profiles").select("full_name, role").eq("user_id", data.user.id).maybeSingle();
        if (prof?.full_name) setCurrentUserFullName(prof.full_name);
        if (prof?.role) setCurrentUserRole(prof.role);
        
        // Lade Models für Moderator
        if (prof?.role === "moderator") {
          const { data: models } = await supabase.from("models").select("id, name");
          if (models) setSichereModels(models);
        }
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
    const zukuenftige = meineGeplantenSchichten.filter(s => {
      if (s.datum > heuteStr) return true;
      if (s.datum === heuteStr) {
        return s.bis > jetztZeit;
      }
      return false;
    });
    return zukuenftige.slice(0, 2);
  }, [meineGeplantenSchichten, jetztZeit]);

  const totalHours = useMemo(() => rows.reduce((sum, r) => sum + toDurationHours(r.started_at, r.ended_at), 0), [rows]);

  const activeShift = useMemo(() => rows.find(r => r.started_at && !r.ended_at), [rows]);
  const aktiveLiveModels = useMemo(() => {
    const heuteStr = getHeuteISOString();
    const treffer = meineGeplantenSchichten.filter(s => s.datum === heuteStr && jetztZeit >= s.von && jetztZeit <= s.bis);
    if (treffer.length === 0) return ["Freie Arbeitszeit (Kein Model)"];
    return treffer.map(s => s.model);
  }, [meineGeplantenSchichten, jetztZeit]);

  async function triggerGlobalStart() {
    if (!currentUserId) { setErr("Benutzerdaten laden noch."); return; }
    setErr(null);
    const { error } = await supabase.from("shift_assignments").insert([
      { chatter_id: currentUserId, model_id: null, started_at: new Date().toISOString(), ended_at: null }
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
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      {/* Header-Zustand */}
      <div className="flex justify-between items-center border-b border-[#AA7C11]/20 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">{currentUserRole === "moderator" ? "🎭 Stripchat Stechuhr" : "Mitarbeiter Stechuhr"}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{currentUserRole === "moderator" ? "Stripchat Sessions & Umsatz-Tracking" : "Schichten erfassen und Live-Mass-Messages kopieren"}</p>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition font-bold cursor-pointer">Abmelden</button>
        </form>
      </div>

      {/* MODERATOR MODE - Stripchat Schicht */}
      {currentUserRole === "moderator" && (
        <>
          <ModeratorStriptchatShift
            currentUserId={currentUserId}
            currentUserFullName={currentUserFullName}
            sichereModels={sichereModels}
          />
          
          <div className="mt-8">
            <h2 className="text-sm font-bold text-[#D4AF37] uppercase tracking-wider mb-4">📊 Deine Stripchat-Sessions</h2>
            {loading ? (
              <div className="text-xs text-slate-500 italic">Lade Daten…</div>
            ) : (
              <div className="space-y-3">
                {rows.map((r) => {
                  const hours = toDurationHours(r.started_at, r.ended_at);
                  return (
                    <div key={r.id} className="rounded-xl border border-[#AA7C11]/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-200 uppercase tracking-wide">Session #{r.id}</div>
                        <div className="text-xs font-bold font-mono text-[#D4AF37]">{hours.toFixed(2)} h</div>
                      </div>
                      <div className="mt-2 text-xs text-slate-400 font-mono">
                        <div><span className="text-slate-500">Start:</span> {r.started_at ? new Date(r.started_at).toLocaleString('de-DE') : "—"}</div>
                        <div><span className="text-slate-500">Ende:</span> {r.ended_at ? new Date(r.ended_at).toLocaleString('de-DE') : "—"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* REGULAR CHATTER MODE - Normal Stechuhr */}
      {currentUserRole !== "moderator" && (
          <span className="text-xs uppercase font-extrabold tracking-wider text-slate-400 mr-2">Deine Stechuhr:</span>
          <button onClick={triggerGlobalStart} disabled={!!activeShift} className="rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-600 disabled:from-slate-800 disabled:to-slate-900 text-black disabled:text-slate-500 px-4 py-2 text-xs font-bold shadow-md transition cursor-pointer">Start Schicht</button>
          <button onClick={triggerGlobalEnd} disabled={!activeShift} className="rounded-lg bg-gradient-to-b from-red-400 to-red-600 disabled:from-slate-800 disabled:to-slate-900 text-black disabled:text-slate-500 px-4 py-2 text-xs font-bold shadow-md transition cursor-pointer">Ende Schicht</button>
        </div>
        
        {activeShift && activeShift.started_at && (
          <div className="flex items-center gap-4 bg-emerald-500/5 border border-emerald-500/20 px-4 py-1.5 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Aktiv:</span>
              <span className="text-xs text-[#D4AF37] font-black uppercase tracking-wide">{aktiveLiveModels.join(", ")}</span>
            </div>
            <LiveTimer startedAt={activeShift.started_at} />
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-slate-400 mb-6 font-medium">
        )}
      </div>
    </main>
  );
en Gesamtstunden: <span className="text-white font-bold font-mono">{totalHours.toFixed(2)} h</span>
      </div>

      {/* 📋 VORSCHAU: Geplante Schichten */}
      <div className="mb-8">
        <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Deine aktuellen Schicht-Zuteilungen</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {naechsteZweiSchichten.map((s) => (
            <div key={s.id} className="bg-black/30 border border-[#AA7C11]/20 rounded-xl p-4 flex flex-col justify-between min-h-[140px] hover:border-[#D4AF37]/40 transition">
              <div>
                <div className="flex justify-between items-center border-b border-[#AA7C11]/10 pb-1.5 mb-2">
                  <span className="text-xs font-black text-[#D4AF37] uppercase tracking-wide">Model: {s.model}</span>
                  <span className="text-[10px] text-slate-400 font-semibold font-mono">{new Date(s.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} | {s.von} - {s.bis} Uhr</span>
                </div>
                {s.nachricht ? (
                  <p className="text-xs text-slate-300 italic line-clamp-2 bg-[#050505]/60 p-2.5 rounded border border-[#AA7C11]/5 break-words">"{s.nachricht}"</p>
                ) : (
                  <p className="text-xs text-slate-500 italic p-2">Keine Mass Message für diese Schicht.</p>
                )}
              </div>
              {s.nachricht && (
                <button type="button" onClick={() => handleCopyMessage(s.nachricht, s.id)} className="w-full mt-3 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#AA7C11]/30 text-[#D4AF37] rounded py-1 text-xs font-bold transition cursor-pointer">
                  {copiedShiftId === s.id ? "✓ Nachricht kopiert!" : "📋 Mass Message kopieren"}
                </button>
              )}
            </div>
          ))}
          {naechsteZweiSchichten.length === 0 && (
            <div className="col-span-2 text-xs text-slate-500 italic p-6 text-center border border-dashed border-[#AA7C11]/10 rounded-xl">Aktuell keine anstehenden Schichten geplant.</div>
          )}
        </div>
      </div>

      {err && <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded mb-4 text-center">{err}</div>}

      {/* HISTORIE */}
      <div className="mt-6">
        <h2 className="text-sm font-bold text-[#D4AF37] uppercase tracking-wider mb-4">Deine persönliche Schichthistorie</h2>
        {loading ? (
          <div className="text-xs text-slate-500 italic">Lade deinen Verlauf…</div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const hours = toDurationHours(r.started_at, r.ended_at);
              const isLaufend = r.started_at && !r.ended_at;
              return (
                <div key={r.id} className={`rounded-xl border p-4 transition-all ${isLaufend ? "border-[#D4AF37] bg-[#AA7C11]/5" : "border-[#AA7C11]/10 bg-black/20"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-bold text-slate-200 uppercase tracking-wide">Schicht #{r.id} {isLaufend && <span className="ml-2 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Aktiv</span>}</div>
                    <div className="text-xs font-bold font-mono text-[#D4AF37]">{hours.toFixed(2)} h</div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-400 border-t border-[#AA7C11]/5 pt-2 font-mono">
                    <div><span className="text-slate-500 font-sans uppercase font-bold text-[9px]">Nutzer:</span> {currentUserEmail}</div>
                    <div><span className="text-slate-500 font-sans uppercase font-bold text-[9px]">Beginn:</span> {r.started_at ? new Date(r.started_at).toLocaleString('de-DE') : "—"}</div>
                    <div><span className="text-slate-500 font-sans uppercase font-bold text-[9px]">Ende:</span> {r.ended_at ? new Date(r.ended_at).toLocaleString('de-DE') : "—"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
