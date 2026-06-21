"use client";

import { useMemo, useState } from "react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateISO(d: Date) {
  // YYYY-MM-DD in lokaler Zeit
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  // JS: 0=Sunday, 1=Monday, ..., 6=Saturday
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7; // Sunday -> 6, Monday -> 0
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function HomePage() {
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

  function goPrevWeek() {
    setBaseWeekStart((d) => addDays(d, -7));
  }

  function goNextWeek() {
    setBaseWeekStart((d) => addDays(d, 7));
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Weekly Calendar</h1>
          <div className="mt-1 text-sm text-white/70">{weekLabel}</div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goPrevWeek}
            className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
          >
            ←
          </button>

          <button
            type="button"
            onClick={() => setBaseWeekStart(startOfWeekMonday(new Date()))}
            className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
          >
            Heute
          </button>

          <button
            type="button"
            onClick={goNextWeek}
            className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-6 rounded border border-white/10 bg-black/20 p-4">
        <div className="grid grid-cols-7 gap-3">
          {days.map((d) => {
            const isToday = formatDateISO(d) === formatDateISO(new Date());

            return (
              <div
                key={formatDateISO(d)}
                className={`rounded p-3 border ${
                  isToday ? "border-gold.primary/70 bg-gold.primary/10" : "border-white/10 bg-black/10"
                }`}
              >
                <div className="text-xs text-white/70">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>

                <div className="mt-1 text-lg font-semibold text-white">
                  {d.toLocaleDateString(undefined, { day: "2-digit" })}
                </div>

                <div className="mt-1 text-xs text-white/60">
                  {d.toLocaleDateString(undefined, { month: "short" })}
                </div>

                <div className="mt-3 text-xs text-white/70">
                  {/* Placeholder Slots: kommt später (08-12, 12-16, 16-20, 20-24) */}
                  <div className="space-y-2">
                    <div className="rounded bg-white/5 px-2 py-1">08–12</div>
                    <div className="rounded bg-white/5 px-2 py-1">12–16</div>
                    <div className="rounded bg-white/5 px-2 py-1">16–20</div>
                    <div className="rounded bg-white/5 px-2 py-1">20–24</div>
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