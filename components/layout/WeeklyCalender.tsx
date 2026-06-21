"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type WeeklyCalendarProps = {
  sichereShifts: any[];
  role: string;
  userEmail: string | null;
  userId: string;
};

function pad2(n: number) { return String(n).padStart(2, "0"); }
function formatDateISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfWeekMonday(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay(); const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday); return d;
}

export default function WeeklyCalendar({ sichereShifts, role, userEmail, userId }: WeeklyCalendarProps) {
  const router = useRouter();
  const supabase = createClient();
  const [baseWeekStart, setBaseWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editDate, setEditDate] = useState("");

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(baseWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [baseWeekStart]);

  const weekLabel = useMemo(() => {
    if (days.length === 0) return "";
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit" };
    return `${days[0].toLocaleDateString(undefined, opts)} – ${days[6].toLocaleDateString(undefined, opts)}`;
  }, [days]);

  function handleCopyText(textToCopy: string, id: number) {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDeleteShift(id: number) {
    if (!window.confirm("Möchtest du diese Schicht wirklich unwiderruflich löschen?")) return;
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (!error) {
      router.refresh();
    }
  }

  async function handleSaveEdit(id: number) {
    const { error } = await supabase
      .from("shifts")
      .update({ notes: editNotes, shift_date: editDate })
      .eq("id", id);
      
    if (!error) {
      setEditingShiftId(null);
      router.refresh();
    }
  }

  return (
    <div className="w-[98%] mx-auto mt-4">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Weekly Schedule Calendar</h1>
          <div className="mt-1 text-base text-slate-400 font-medium">{weekLabel}</div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setBaseWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return startOfWeekMonday(n); })} className="rounded bg-slate-800 border border-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-700 cursor-pointer font-semibold transition">← Letzte Woche</button>
          <button type="button" onClick={() => setBaseWeekStart(startOfWeekMonday(new Date()))} className="rounded bg-slate-800 border border-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-700 cursor-pointer font-semibold transition">Heute</button>
          <button type="button" onClick={() => setBaseWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return startOfWeekMonday(n); })} className="rounded bg-slate-800 border border-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-700 cursor-pointer font-semibold transition">Nächste Woche →</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-md">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {days.map((d) => {
            const dateKey = formatDateISO(d);
            const isToday = dateKey === formatDateISO(new Date());

            const schichtenAnDiesemTag = sichereShifts.filter((s) => {
              if (!s.shift_date) return false;
              return s.shift_date === dateKey;
            });

            return (
              <div key={dateKey} className={`rounded-xl p-4 border transition-all flex flex-col justify-between min-h-[480px] ${
                isToday ? "border-amber-500/40 bg-amber-500/5 shadow-lg shadow-amber-500/5" : "border-slate-800/80 bg-slate-900/40"
              }`}>
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className={`text-base font-bold px-2 py-0.5 rounded-md ${isToday ? "bg-amber-500 text-slate-950" : "text-white"}`}>{d.toLocaleDateString(undefined, { day: "2-digit" })}</span>
                  </div>

                  <div className="space-y-3">
                    {schichtenAnDiesemTag.length === 0 ? (
                      <div className="text-xs text-slate-500 italic p-2">Keine Schichten geplant</div>
                    ) : (
                      schichtenAnDiesemTag.map((schicht) => {
                        let parsedNotes = { mitarbeiter: "Mitarbeiter", von: "00:00", bis: "00:00", model: "Kein Model", nachricht: "" };
                        
                        try {
                          if (schicht.notes && schicht.notes.startsWith("{")) {
                            parsedNotes = JSON.parse(schicht.notes);
                          } else {
                            parsedNotes.mitarbeiter = schicht.notes || "Geplant";
                          }
                        } catch (e) {
                          parsedNotes.mitarbeiter = "Geplant";
                        }

                        return (
                          <div key={schicht.id} className="rounded-lg bg-slate-900 border border-slate-800 p-3 shadow-md relative group hover:border-slate-700 transition">
                            {role === "admin" && editingShiftId !== schicht.id && (
                              <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button type="button" onClick={() => { setEditingShiftId(schicht.id); setEditNotes(schicht.notes); setEditDate(schicht.shift_date); }} className="p-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 text-[10px] font-bold cursor-pointer">✏️</button>
                                <button type="button" onClick={() => handleDeleteShift(schicht.id)} className="p-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 text-[10px] font-bold cursor-pointer">🗑️</button>
                              </div>
                            )}

                            {editingShiftId === schicht.id ? (
                              <div className="space-y-2 mt-1">
                                <span className="text-[10px] font-bold text-blue-400 block">Schicht modifizieren:</span>
                                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white" />
                                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={5} className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-[10px] font-mono text-white resize-none" />
                                <div className="flex gap-1.5 justify-end">
                                  <button type="button" onClick={() => setEditingShiftId(null)} className="px-2 py-1 bg-slate-800 rounded text-[10px] cursor-pointer">Abbrechen</button>
                                  <button type="button" onClick={() => handleSaveEdit(schicht.id)} className="px-2 py-1 bg-emerald-600 rounded text-[10px] font-bold cursor-pointer">Sichern</button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-300 space-y-1">
                                <div className="font-semibold text-white">{parsedNotes.mitarbeiter}</div>
                                {parsedNotes.von && parsedNotes.bis && (
                                  <div className="text-[11px] text-slate-400">{parsedNotes.von} - {parsedNotes.bis} Uhr</div>
                                )}
                                {parsedNotes.model !== "Kein Model" && (
                                  <div className="text-[10px] text-amber-400/80">Model: {parsedNotes.model}</div>
                                )}
                                {parsedNotes.nachricht && (
                                  <div className="text-[10px] text-slate-400 italic mt-1 border-t border-slate-800/60 pt-1">{parsedNotes.nachricht}</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
