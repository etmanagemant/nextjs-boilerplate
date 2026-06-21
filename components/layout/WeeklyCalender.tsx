"use client";

import { useMemo, useState } from "react";

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
function addDays(date: Date, days: number) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
}

export default function WeeklyCalendar({ sichereShifts, role, userEmail, userId }: WeeklyCalendarProps) {
  const [baseWeekStart, setBaseWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(baseWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [baseWeekStart]);

  // 🟢 FIXED: weekLabel nutzt jetzt das Tobias-Original mit days[0] und days[6] ohne Array-Absturz!
  const weekLabel = useMemo(() => {
    if (days.length === 0) return "";
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit" };
    return `${days[0].toLocaleDateString(undefined, opts)} – ${days[6].toLocaleDateString(undefined, opts)}`;
  }, [days]);

  // Funktion zum schnellen Kopieren der Mass Message
  function handleCopyText(textToCopy: string, id: number) {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000); // Setzt den Text nach 2 Sek zurück
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Weekly Calendar</h1>
          <div className="mt-1 text-sm text-white/70">{weekLabel}</div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setBaseWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return startOfWeekMonday(n); })} className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 cursor-pointer font-medium">←</button>
          <button type="button" onClick={() => setBaseWeekStart(startOfWeekMonday(new Date()))} className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 cursor-pointer font-medium">Heute</button>
          <button type="button" onClick={() => setBaseWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return startOfWeekMonday(n); })} className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 cursor-pointer font-medium">→</button>
        </div>
      </div>

      <div className="rounded border border-white/10 bg-black/20 p-4">
        <div className="grid grid-cols-7 gap-3">
          {days.map((d) => {
            const dateKey = formatDateISO(d);
            const isToday = dateKey === formatDateISO(new Date());

            const schichtenAnDiesemTag = sichereShifts.filter((s) => {
              if (!s.shift_date) return false;
              const istGleicherTag = s.shift_date === dateKey;
              
              if (role === "admin") {
                return istGleicherTag;
              } else {
                // Ein Chatter sieht nur seine Schichten im Text gefiltert
                return istGleicherTag && userEmail && s.notes?.includes(`Mitarbeiter: ${userEmail}`);
              }
            });

            return (
              <div key={dateKey} className={`rounded p-3 border min-h-[330px] flex flex-col justify-between ${isToday ? "border-amber-500/50 bg-amber-500/10" : "border-white/10 bg-black/10"}`}>
                <div>
                  <div className="text-xs text-white/70">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                  <div className="mt-1 text-lg font-semibold text-white">{d.toLocaleDateString(undefined, { day: "2-digit" })}</div>
                  <div className="mt-1 text-xs text-white/60 mb-3">{d.toLocaleDateString(undefined, { month: "short" })}</div>

                  <div className="space-y-2 mt-2">
                    {schichtenAnDiesemTag.map((schicht) => {
                      // Schneidet die Mass Message sauber aus der Textkette heraus
                      const textData = schicht.notes || "";
                      const cleanInfo = textData.split(" | MESSAGE_START:")[0] || textData;
                      
                      let massMessageText = "";
                      if (textData.includes("MESSAGE_START:")) {
                        massMessageText = textData.split("MESSAGE_START:")[1]?.split(":MESSAGE_END")[0] || "";
                      }

                      return (
                        <div key={schicht.id} className="rounded bg-blue-600/20 border border-blue-500/30 p-2 text-left text-[11px] text-slate-200">
                          <div className="font-medium whitespace-pre-wrap">{cleanInfo}</div>
                          
                          {/* 🟢 DER KOPiER-BUTTON FÜR DIE MASS MESSAGE */}
                          {massMessageText && (
                            <div className="mt-2 bg-black/40 p-1.5 rounded border border-white/5 flex flex-col gap-1">
                              <span className="text-[10px] text-emerald-400 font-bold">Mass Message:</span>
                              <div className="text-[10px] text-slate-300 italic truncate mb-1">"{massMessageText}"</div>
                              <button
                                type="button"
                                onClick={() => handleCopyText(massMessageText, schicht.id)}
                                className={`w-full text-center text-[10px] rounded py-1 font-bold transition cursor-pointer ${
                                  copiedId === schicht.id 
                                    ? "bg-green-600 text-white" 
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                                }`}
                              >
                                {copiedId === schicht.id ? "✓ Kopiert!" : "Text kopieren"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {schichtenAnDiesemTag.length === 0 && <div className="text-[10px] text-slate-600 italic text-center pb-8">Keine Schichten</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
