"use client";

import { useState } from "react";

/**
 * Task #67 - model's own OnlyFans stats. Reuses the same /of-earnings and
 * /of-stats endpoints already CONFIRMED LIVE for OF Inbox Beta's admin
 * panel, just through /api/crm/model-onlyfans-stats (model-scoped, no
 * modelId the client could tamper with).
 *
 * Scope honestly: /of-stats only covers mass-message stats (count/views/
 * earnings, last 30 days fixed) - not total 1:1 chat volume ("Nachrichten
 * rein/raus") or a multi-month trend ("wie die Monate davor waren"). No
 * confirmed endpoint for either yet - shown as-is rather than invented.
 */
export default function ModelOnlyFansStatsClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [earnings, setEarnings] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/model-onlyfans-stats");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      setEarnings(data.earnings || null);
      setStats(data.stats || null);
      setLoaded(true);
    } catch (e: any) {
      setError(e.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  function togglePayout() {
    setPayoutOpen((v) => !v);
    if (!loaded) load();
  }

  const mm = stats?.overview?.massMessages;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-black bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent uppercase tracking-wider mb-6">
        OnlyFans Statistik
      </h1>

      <button
        onClick={togglePayout}
        className="mb-4 px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black hover:from-[#E5C158]"
      >
        {payoutOpen ? "Auszahlung ausblenden" : "Auszahlung anzeigen"}
      </button>

      {error && <div className="text-sm text-red-400 mb-4">{error}</div>}
      {loading && <div className="text-sm text-slate-500 italic mb-4">Lade…</div>}

      {payoutOpen && earnings && (
        <div className="grid grid-cols-2 gap-4 mb-6 bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl p-5">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Verfügbar</div>
            <div className="text-2xl font-black text-[#C9A86A]">{earnings.payoutAvailable} {earnings.currency}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">Ausstehend</div>
            <div className="text-2xl font-black text-[#C9A86A]">{earnings.payoutPending} {earnings.currency}</div>
          </div>
        </div>
      )}

      {loaded && mm && (
        <div className="bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#C9A86A] mb-4">Massnachrichten (letzte 30 Tage)</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-xs text-slate-500 uppercase">Versendet</div>
              <div className="text-xl font-black text-white">{mm.count?.total ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase">Views</div>
              <div className="text-xl font-black text-white">{mm.views?.total ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase">Einnahmen</div>
              <div className="text-xl font-black text-white">${mm.earnings?.total ?? 0}</div>
            </div>
          </div>
          {Array.isArray(mm.chartData) && mm.chartData.length > 0 && (
            <div className="flex items-end gap-0.5 h-16">
              {mm.chartData.map((d: any, i: number) => {
                const max = Math.max(...mm.chartData.map((x: any) => x.count || 0), 1);
                const h = Math.max(2, ((d.count || 0) / max) * 100);
                return <div key={i} title={`${d.date?.slice(0, 10)}: ${d.count}`} className="flex-1 bg-[#C9A86A]/60 rounded-t" style={{ height: `${h}%` }} />;
              })}
            </div>
          )}
          <p className="text-[10px] text-slate-500 mt-3">
            Zeigt aktuell nur Massnachrichten der letzten 30 Tage. Gesamter Chat-Nachrichtenverkehr und ein
            Monatsvergleich über einen längeren Zeitraum sind noch nicht angebunden.
          </p>
        </div>
      )}

      {loaded && !mm && !error && (
        <div className="text-sm text-slate-500">Keine Statistikdaten verfügbar.</div>
      )}
    </div>
  );
}
