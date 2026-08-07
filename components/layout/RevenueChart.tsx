"use client";

import { useEffect, useMemo, useState } from "react";

type Bucket = { label: string; start: string; gross: number; net: number };
type Granularity = "day" | "week" | "month" | "custom";

const CHART_W = 760;
const CHART_H = 260;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthsAgoIso(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Ersetzt die reine "heute"-Umsatz-Kachel (2026-08-07, explizit gewuenscht):
 * Woche = Balkendiagramm der letzten 12 Wochen, Monat = Linien-/Flaechen-
 * diagramm der letzten 12 Monate (Pfeile blaettern weiter zurueck),
 * Zeitraum = freier Datumsbereich. Admin ohne userId sieht den Agentur-
 * Gesamtumsatz, mit userId (oder als Chatter) nur den eigenen.
 */
export function RevenueChart({ userId, isAdmin }: { userId?: string; isAdmin: boolean }) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [offset, setOffset] = useState(0);
  const [customStart, setCustomStart] = useState(monthsAgoIso(1));
  const [customEnd, setCustomEnd] = useState(todayIso());
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [isAgencyTotal, setIsAgencyTotal] = useState(false);
  const [isModelTotal, setIsModelTotal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    setOffset(0);
  }, [granularity]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ granularity, offset: String(offset) });
    if (userId) params.set("userId", userId);
    if (granularity === "custom") {
      params.set("start", customStart);
      params.set("end", customEnd);
    }
    fetch(`/api/crm/revenue-timeseries?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setBuckets(d.buckets || []);
        setIsAgencyTotal(!!d.isAgencyTotal);
        setIsModelTotal(!!d.isModelTotal);
      })
      .catch(() => setBuckets([]))
      .finally(() => setLoading(false));
  }, [granularity, offset, customStart, customEnd, userId]);

  const total = useMemo(() => buckets.reduce((s, b) => s + b.net, 0), [buckets]);
  const max = Math.max(...buckets.map((b) => b.net), 1);
  const innerW = CHART_W - PAD_L - PAD_R;
  const innerH = CHART_H - PAD_T - PAD_B;

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i);

  const isBar = granularity === "week" || granularity === "day";
  const points = buckets.map((b, i) => {
    const x = buckets.length > 1 ? (i / (buckets.length - 1)) * innerW : innerW / 2;
    const y = innerH - (b.net / max) * innerH;
    return { x, y, b };
  });
  const linePath = points.length > 0 ? `M${points.map((p) => `${p.x},${p.y}`).join(" L")}` : "";
  const areaPath = points.length > 0 ? `M${points[0].x},${innerH} L${points.map((p) => `${p.x},${p.y}`).join(" L")} L${points[points.length - 1].x},${innerH} Z` : "";

  const barW = buckets.length > 0 ? Math.min(36, (innerW / buckets.length) * 0.6) : 0;

  // Nicht jedes Label zeigen wenn viele Buckets (z.B. 30 Tage) - sonst
  // ueberlappen sich die Beschriftungen unlesbar.
  const labelStep = Math.max(1, Math.ceil(buckets.length / 10));

  return (
    <section className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-[#C9A86A] uppercase tracking-wider">
            {isAgencyTotal ? "Agentur-Umsatz" : isModelTotal ? "Dein Model-Umsatz" : "Dein Umsatz"}
          </h2>
          <div className="text-2xl font-black text-[#E2C48A] font-mono mt-1">${total.toFixed(2)}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
            {(["day", "week", "month", "custom"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-md transition ${
                  granularity === g ? "bg-[#C9A86A] text-black" : "text-slate-400 hover:text-[#E2C48A]"
                }`}
              >
                {g === "day" ? "Tage" : g === "week" ? "Woche" : g === "month" ? "Monat" : "Zeitraum"}
              </button>
            ))}
          </div>
          {granularity !== "custom" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOffset((o) => o + 1)}
                title="Weiter zurück"
                className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-[#E2C48A] hover:border-[#C9A86A]/40"
              >
                ←
              </button>
              <button
                onClick={() => setOffset((o) => Math.max(0, o - 1))}
                disabled={offset === 0}
                title="Näher an heute"
                className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-[#E2C48A] hover:border-[#C9A86A]/40 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:border-white/10"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {granularity === "custom" && (
        <div className="flex items-center gap-2 mb-4 text-xs">
          {/* Bugfix (gemeldet 2026-08-07): native Datums-Eingabe zeigte
              Monat/Tag statt Tag.Monat.Jahr - der Browser richtet sich
              dabei nach dem lang-Attribut des Feldes selbst, nicht nach
              unseren toLocaleDateString("de-DE")-Aufrufen anderswo. */}
          <input
            type="date"
            lang="de-DE"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            max={customEnd}
            style={{ colorScheme: "dark", accentColor: "#C9A86A" }}
            className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[#E2C48A] outline-none focus:border-[#C9A86A]/40"
          />
          <span className="text-slate-500">bis</span>
          <input
            type="date"
            lang="de-DE"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            min={customStart}
            max={todayIso()}
            style={{ colorScheme: "dark", accentColor: "#C9A86A" }}
            className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[#E2C48A] outline-none focus:border-[#C9A86A]/40"
          />
        </div>
      )}

      {loading ? (
        <div className="h-[260px] flex items-center justify-center text-xs text-slate-500 italic">Lade…</div>
      ) : buckets.length === 0 || total === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-xs text-slate-500">Kein Umsatz in diesem Zeitraum</div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto overflow-visible">
            <defs>
              <linearGradient id="revchart-area" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#E5C158" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#E5C158" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g transform={`translate(${PAD_L},${PAD_T})`}>
              {yTickValues.map((v, i) => {
                const y = innerH - (v / max) * innerH;
                return (
                  <g key={i}>
                    <line x1={0} y1={y} x2={innerW} y2={y} stroke="#ffffff" strokeOpacity={0.06} />
                    <text x={-8} y={y + 3} textAnchor="end" fontSize={10} fill="#64748b">
                      ${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
                    </text>
                  </g>
                );
              })}

              {isBar
                ? points.map((p, i) => (
                    <rect
                      key={i}
                      x={p.x - barW / 2}
                      y={p.y}
                      width={barW}
                      height={Math.max(1, innerH - p.y)}
                      rx={3}
                      fill={hoverIdx === i ? "#E5C158" : "#C9A86A"}
                      opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.55}
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                      style={{ cursor: "pointer" }}
                    />
                  ))
                : (
                  <>
                    <path d={areaPath} fill="url(#revchart-area)" stroke="none" />
                    <path d={linePath} fill="none" stroke="#C9A86A" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {points.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={hoverIdx === i ? 5 : 3}
                        fill={hoverIdx === i ? "#E5C158" : "#C9A86A"}
                        onMouseEnter={() => setHoverIdx(i)}
                        onMouseLeave={() => setHoverIdx(null)}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </>
                )}

              {points.map((p, i) =>
                i % labelStep === 0 ? (
                  <text key={i} x={p.x} y={innerH + 18} textAnchor="middle" fontSize={10} fill="#64748b">
                    {p.b.label}
                  </text>
                ) : null
              )}
            </g>
          </svg>
          {hoverIdx !== null && points[hoverIdx] && (
            <div
              className="absolute bg-[#0A0A0A] border border-[#C9A86A]/40 rounded-lg px-3 py-2 text-xs pointer-events-none shadow-xl"
              style={{
                left: `${((PAD_L + points[hoverIdx].x) / CHART_W) * 100}%`,
                top: `${((PAD_T + points[hoverIdx].y) / CHART_H) * 100}%`,
                transform: "translate(-50%, -120%)",
              }}
            >
              <div className="font-bold text-[#E2C48A]">{points[hoverIdx].b.label}</div>
              <div className="text-emerald-400 font-mono">${points[hoverIdx].b.net.toFixed(2)} netto</div>
              <div className="text-slate-500 font-mono">${points[hoverIdx].b.gross.toFixed(2)} brutto</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
