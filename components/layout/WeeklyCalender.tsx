"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type WeeklyCalendarProps = {
  sichereShifts: any[];
  modelsListe: any[];
  role: string;
  userEmail: string | null;
  userId: string;
  profileMap: Map<string, string>;
};

function pad2(n: number) { return String(n).padStart(2, "0"); }
function formatDateISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfWeekMonday(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay(); const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday); return d;
}

export default function WeeklyCalendar({ sichereShifts, modelsListe, role, userEmail, userId, profileMap }: WeeklyCalendarProps) {
  const router = useRouter();
  const supabase = createClient();
  const [baseWeekStart, setBaseWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editMitarbeiter, setEditMitarbeiter] = useState("");
  const [editVon, setEditVon] = useState("00:00");
  const [editBis, setEditBis] = useState("00:00");
  const [editModel, setEditModel] = useState("Kein Model");
  const [editNachricht, setEditNachricht] = useState("");

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
    if (!error) { router.refresh(); }
  }

  function startEditing(schicht: any) {
    setEditingShiftId(schicht.id);
    setEditDate(schicht.shift_date || "");
    let parsed = { mitarbeiter: "Mitarbeiter", von: "00:00", bis: "00:00", model: "Kein Model", nachricht: "" };
    try {
      if (schicht.notes && schicht.notes.startsWith("{")) {
        parsed = JSON.parse(schicht.notes);
      } else {
        parsed.mitarbeiter = schicht.notes || "Geplant";
      }
    } catch (e) {
      parsed.mitarbeiter = "Geplant";
    }
    setEditMitarbeiter(parsed.mitarbeiter);
    setEditVon(parsed.von || "00:00");
    setEditBis(parsed.bis || "00:00");
    setEditModel(parsed.model || "Kein Model");
    setEditNachricht(parsed.nachricht || "");
  }

  async function handleSaveEdit(id: number) {
    const finalJsonObj = {
      mitarbeiter: editMitarbeiter,
      von: editVon,
      bis: editBis,
      model: editModel,
      nachricht: editNachricht
    };
    const { error } = await supabase
      .from("shifts")
      .update({ notes: JSON.stringify(finalJsonObj), shift_date: editDate })
      .eq("id", id);
    if (!error) {
      setEditingShiftId(null);
      router.refresh();
    }
  }

  return (
    <div className="w-[98%] mx-auto mt-4 text-[#F3E5AB]">
      {/* Kopfzeile im edlen Gold-Look */}
      <div className="flex items-center justify-between gap-4 mb-6 bg-[#0A0A0A] p-4 rounded-xl border border-[#AA7C11]/20 shadow-lg">
        <div>
          <h1 className="text-2xl font-black tracking-wide bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase">Weekly Schedule Calendar</h1>
          <div className="mt-1 text-sm text-[#D4AF37]/80 font-mono font-semibold">{weekLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setBaseWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return startOfWeekMonday(n); })} className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-4 py-2 text-xs font-bold text-black shadow-md transition-all cursor-pointer">← Letzte Woche</button>
          <button type="button" onClick={() => setBaseWeekStart(startOfWeekMonday(new Date()))} className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-4 py-2 text-xs font-bold text-black shadow-md transition-all cursor-pointer">Heute</button>
          <button type="button" onClick={() => setBaseWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return startOfWeekMonday(n); })} className="rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-4 py-2 text-xs font-bold text-black shadow-md transition-all cursor-pointer">Nächste Woche →</button>
        </div>
      </div>

      <div className="rounded-xl border border-[#AA7C11]/20 bg-[#0A0A0A]/60 p-6 shadow-2xl backdrop-blur-md">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {days.map((d) => {
            const dateKey = formatDateISO(d);
            const isToday = dateKey === formatDateISO(new Date());
            
            // 🔑 KRITISCHE FILTERUNG: Schichten nach Benutzer-Rolle und zugewiesener Mitarbeiter-Rolle filtern
            let schichtenAnDiesemTag = sichereShifts.filter((s) => s.shift_date && s.shift_date === dateKey);
            
            if (role !== "admin") {
              // Extrahiere die Rolle des zugewiesenen Mitarbeiters aus den Schicht-Notizen
              schichtenAnDiesemTag = schichtenAnDiesemTag.filter((s) => {
                let assignedUserRole = "chatter"; // Fallback
                try {
                  if (s.notes && s.notes.startsWith("{")) {
                    const parsed = JSON.parse(s.notes);
                    // Versuche User-ID oder assigned_user_id aus den Notes zu finden
                    // Wenn nicht vorhanden, verwende default "chatter"
                  }
                } catch (e) { /* parsing error, verwende fallback */ }
                
                // Wenn nur Benutzer-ID in der Schicht gespeichert ist (als assigned_user_id oder chatter_id)
                if (s.chatter_id || s.user_id || s.assigned_user_id) {
                  const assignedUserId = s.chatter_id || s.user_id || s.assigned_user_id;
                  assignedUserRole = profileMap?.get(assignedUserId) || "chatter";
                }
                
                // Benutzer sieht nur Schichten von Personen mit der gleichen Rolle
                return assignedUserRole === role;
              });
            }

            return (
              <div key={dateKey} className={`rounded-xl p-4 border transition-all flex flex-col justify-between min-h-[480px] ${
                isToday ? "border-[#D4AF37] bg-[#D4AF37]/5 shadow-lg shadow-[#D4AF37]/5" : "border-[#AA7C11]/20 bg-black/40"
              }`}>
                <div>
                  <div className="flex items-center justify-between border-b border-[#AA7C11]/10 pb-2 mb-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]/70">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className={`text-base font-mono font-bold px-2 py-0.5 rounded-md ${isToday ? "bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black" : "text-[#F3E5AB]"}`}>{d.toLocaleDateString(undefined, { day: "2-digit" })}</span>
                  </div>

                  <div className="space-y-3">
                    {schichtenAnDiesemTag.length === 0 ? (
                      <div className="text-xs text-slate-500 italic p-2 text-center border border-dashed border-[#AA7C11]/10 rounded-lg">Keine Schichten</div>
                    ) : (
                      schichtenAnDiesemTag.map((schicht) => {
                        let parsedNotes = { mitarbeiter: "Mitarbeiter", von: "00:00", bis: "00:00", model: "Kein Model", nachricht: "" };
                        try {
                          if (schicht.notes && schicht.notes.startsWith("{")) { parsedNotes = JSON.parse(schicht.notes); }
                          else { parsedNotes.mitarbeiter = schicht.notes || "Geplant"; }
                        } catch (e) { parsedNotes.mitarbeiter = "Geplant"; }
                        
                        // 🎨 OPTIONALE VISUELLE UNTERSCHEIDUNG FÜR ADMIN
                        let shiftColorClass = "border-[#AA7C11]/20 bg-[#050505]"; // Default (Chatter - Gold)
                        if (role === "admin") {
                          const assignedUserId = schicht.chatter_id || schicht.user_id || schicht.assigned_user_id;
                          const assignedUserRole = profileMap?.get(assignedUserId) || "chatter";
                          if (assignedUserRole === "moderator") {
                            shiftColorClass = "border-slate-500/40 bg-slate-900/30"; // Moderator - Silber/Grau
                          }
                        }
                        
                        return (
                          <div key={schicht.id} className={`rounded-lg border p-3 shadow-md relative group hover:border-[#D4AF37]/50 transition ${shiftColorClass}`}>
                            {role === "admin" && editingShiftId !== schicht.id && (
                              <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button type="button" onClick={() => startEditing(schicht)} className="p-1 bg-[#D4AF37]/10 text-[#D4AF37] rounded hover:bg-[#D4AF37]/20 text-[10px] font-bold cursor-pointer">✏️</button>
                                <button type="button" onClick={() => handleDeleteShift(schicht.id)} className="p-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 text-[10px] font-bold cursor-pointer">🗑️</button>
                              </div>
                            )}

                            {editingShiftId === schicht.id ? (
                              <div className="space-y-2.5 mt-1 bg-black p-2.5 rounded-md border border-[#AA7C11]/30">
                                <span className="text-[10px] font-bold text-[#D4AF37] block tracking-wider uppercase">Schicht anpassen</span>
                                <div>
                                  <label className="text-[9px] text-[#D4AF37] font-bold block mb-0.5">Datum</label>
                                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full bg-[#050505] border border-[#AA7C11]/40 rounded p-1 text-xs text-white focus:border-[#D4AF37] outline-none" />
                                </div>
                                <div>
                                  <label className="text-[9px] text-[#D4AF37] font-bold block mb-0.5">Mitarbeiter</label>
                                  <input type="text" value={editMitarbeiter} onChange={(e) => setEditMitarbeiter(e.target.value)} className="w-full bg-[#050505] border border-[#AA7C11]/40 rounded p-1 text-xs text-white focus:border-[#D4AF37] outline-none" />
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div>
                                    <label className="text-[9px] text-[#D4AF37] font-bold block mb-0.5">Von</label>
                                    <input type="text" placeholder="12:00" value={editVon} onChange={(e) => setEditVon(e.target.value)} className="w-full bg-[#050505] border border-[#AA7C11]/40 rounded p-1 text-xs text-white focus:border-[#D4AF37] outline-none" />
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-[#D4AF37] font-bold block mb-0.5">Bis</label>
                                    <input type="text" placeholder="16:00" value={editBis} onChange={(e) => setEditBis(e.target.value)} className="w-full bg-[#050505] border border-[#AA7C11]/40 rounded p-1 text-xs text-white focus:border-[#D4AF37] outline-none" />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] text-[#D4AF37] font-bold block mb-0.5">Model auswählen</label>
                                  <select value={editModel} onChange={(e) => setEditModel(e.target.value)} className="w-full bg-[#050505] border border-[#AA7C11]/40 rounded p-1 text-xs text-white focus:border-[#D4AF37] outline-none cursor-pointer">
                                    <option value="Kein Model" className="bg-[#050505] text-white">Kein Model</option>
                                    {(modelsListe || []).map((m) => (
                                      <option key={m.id} value={m.name} className="bg-[#050505] text-white">{m.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[9px] text-[#D4AF37] font-bold block mb-0.5">Nachricht (optional)</label>
                                  <textarea value={editNachricht} onChange={(e) => setEditNachricht(e.target.value)} rows={2} className="w-full bg-[#050505] border border-[#AA7C11]/40 rounded p-1 text-xs text-white focus:border-[#D4AF37] outline-none resize-none" />
                                </div>
                                <div className="flex gap-1.5 justify-end pt-1 border-t border-[#AA7C11]/10">
                                  <button type="button" onClick={() => setEditingShiftId(null)} className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[10px] font-semibold hover:bg-slate-700 cursor-pointer">Abbrechen</button>
                                  <button type="submit" onClick={() => handleSaveEdit(schicht.id)} className="px-2 py-1 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black rounded text-[10px] font-bold hover:from-[#E5C158] cursor-pointer">Sichern</button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-300 space-y-1">
                                <div className="font-semibold text-[#F3E5AB] text-sm">{parsedNotes.mitarbeiter}</div>
                                {parsedNotes.von && parsedNotes.bis && (
                                  <div className="text-[11px] text-slate-400 font-medium font-mono">{parsedNotes.von} - {parsedNotes.bis} Uhr</div>
                                )}
                                {parsedNotes.model && parsedNotes.model !== "Kein Model" && (
                                  <div className="text-[10px] text-[#D4AF37] font-bold bg-[#AA7C11]/10 border border-[#AA7C11]/30 rounded px-1.5 py-0.5 inline-block mt-0.5">Model: {parsedNotes.model}</div>
                                )}
                                {parsedNotes.nachricht && (
                                  <div className="text-[10px] text-slate-400 bg-black/60 rounded p-1.5 border border-[#AA7C11]/10 relative group/msg mt-1.5 break-words">
                                    <span>{parsedNotes.nachricht}</span>
                                    <button type="button" onClick={() => handleCopyText(parsedNotes.nachricht, schicht.id)} className="absolute bottom-1 right-1 opacity-0 group-hover/msg:opacity-100 bg-[#050505] border border-[#AA7C11]/40 text-[10px] px-1 rounded text-slate-300 hover:text-[#D4AF37] transition cursor-pointer">
                                      {copiedId === schicht.id ? "✔️" : "📋"}
                                    </button>
                                  </div>
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
