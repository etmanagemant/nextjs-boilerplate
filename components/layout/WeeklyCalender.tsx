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
  const d = new Date(date); d.setDate(d.getDate() + days); return d;
}

export default function WeeklyCalendar({ sichereShifts, role, userEmail, userId }: WeeklyCalendarProps) {
  const [baseWeekStart, setBaseWeekStart] = useState(() => startOfWeekMonday(new Date()));

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(baseWeekStart, i));
  }, [baseWeekStart]);

  const weekLabel = useMemo(() => {
    const start = days[0];
    const end = days[6];
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit" };
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }, [days]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Weekly Calendar</h1>
          <div className="mt-1 text-sm text-white/70">{weekLabel}</div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setBaseWeekStart((d) => addDays(d, -7))} className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 cursor-pointer font-medium">←</button>
          <button type="button" onClick={() => setBaseWeekStart(startOfWeekMonday(new Date()))} className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 cursor-pointer font-medium">Heute</button>
          <button type="button" onClick={() => setBaseWeekStart((d) => addDays(d, 7))} className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 cursor-pointer font-medium">→</button>
        </div>
      </div>

      <div className="rounded border border-white/10 bg-black/20 p-4">
        <div className="grid grid-cols-7 gap-3">
          {days.map((d) => {
            const dateKey = formatDateISO(d);
            const isToday = dateKey === formatDateISO(new Date());

            // 🟢 DATUMS-FILTER KORRIGIERT: Extrahiert das Datum aus dem started_at-Zeitstempel (YYYY-MM-DD)
            const schichtenAnDiesemTag = sichereShifts.filter((s) => {
              if (!s.started_at) return false;
              const schichtDatumYMD = s.started_at.split("T")[0];
              const istGleicherTag = schichtDatumYMD === dateKey;
              
              if (role === "admin") {
                return istGleicherTag;
              } else {
                return istGleicherTag && (s.chatter_id === userId || s.profiles?.email === userEmail);
              }
            });

            return (
              <div key={dateKey} className={`rounded p-3 border min-h-[300px] ${isToday ? "border-amber-500/50 bg-amber-500/10" : "border-white/10 bg-black/10"}`}>
                <div className="text-xs text-white/70">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="mt-1 text-lg font-semibold text-white">{d.toLocaleDateString(undefined, { day: "2-digit" })}</div>
                <div className="mt-1 text-xs text-white/60 mb-3">{d.toLocaleDateString(undefined, { month: "short" })}</div>

                <div className="space-y-2 mt-2">
                  {schichtenAnDiesemTag.map((schicht) => {
                    // Uhrzeiten aus den ISO-Stamps formrahmeren (z.B. "14:00 - 22:00")
                    const sTime = schicht.started_at ? new Date(schicht.started_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : "00:00";
                    const eTime = schicht.ended_at ? new Date(schicht.ended_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : "00:00";
                    
                    // Zeigt den echten Namen aus der profiles-Verknüpfung an!
                    const mitarbeiterName = schicht.profiles?.full_name || schicht.profiles?.email || "Mitarbeiter";

                    return (
                      <div key={schicht.id} className="rounded bg-blue-600/20 border border-blue-500/30 p-2 text-left">
                        <div className="text-[11px] font-bold text-blue-400 truncate">
                          👤 {mitarbeiterName}
                        </div>
                        <div className="text-[10px] text-slate-300 mt-0.5">
                          ⏰ {sTime} – {eTime} Uhr
                        </div>
                        {schicht.models?.name && (
                          <div className="text-[10px] text-emerald-400 mt-0.5 font-medium truncate">
                            💃 Model: {schicht.models.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {schichtenAnDiesemTag.length === 0 && (
                    <div className="text-[10px] text-slate-600 italic text-center pt-8">Keine Schichten</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
