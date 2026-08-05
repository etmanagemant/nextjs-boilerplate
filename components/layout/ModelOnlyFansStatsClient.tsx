"use client";

import { useEffect, useState } from "react";
import { CircularProgress, Sparkline } from "@/components/layout/StatViz";

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

  // War vorher nur ans Auszahlung-Toggle gekoppelt (unlogisch - Stats
  // hatten mit dem Auszahlungs-Button nichts zu tun) - lädt jetzt direkt.
  useEffect(() => {
    load();
  }, []);

  const mm = stats?.overview?.massMessages;
  const chartData: any[] = Array.isArray(mm?.chartData) ? mm.chartData : [];
  const daysWithActivity = chartData.filter((d) => (d.count || 0) > 0).length;
  const viewsPerMessage = mm?.count?.total > 0 ? (mm.views?.total || 0) / mm.count.total : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent uppercase tracking-wider">
          OnlyFans Statistik
        </h1>
        <button
          onClick={() => setPayoutOpen((v) => !v)}
          className="px-5 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black hover:from-[#E5C158]"
        >
          {payoutOpen ? "Auszahlung ausblenden" : "Auszahlung anzeigen"}
        </button>
      </div>

      {error && <div className="text-sm text-red-400 mb-4">{error}</div>}
      {loading && <div className="text-sm text-slate-500 italic mb-4">Lade…</div>}

      {payoutOpen && earnings && (
        <div className="grid grid-cols-2 gap-4 mb-6 bg-gradient-to-br from-[#1a1a1a] to-black border border-[#9C7A3D]/30 rounded-xl p-5">
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
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-[#3c2f16]/40 to-[#5e4922]/20 border border-[#9C7A3D]/30 rounded-xl p-5 shadow-lg">
              <div className="text-[10px] font-black text-[#C9A86A] uppercase tracking-widest mb-2">Versendet</div>
              <div className="text-2xl font-black text-[#E2C48A]">{mm.count?.total ?? 0}</div>
              <div className="text-xs text-[#C9A86A] mt-1">Massnachrichten (30 Tage)</div>
            </div>
            <div className="bg-gradient-to-br from-[#3c2f16]/40 to-[#5e4922]/20 border border-[#9C7A3D]/30 rounded-xl p-5 shadow-lg">
              <div className="text-[10px] font-black text-[#C9A86A] uppercase tracking-widest mb-2">Views</div>
              <div className="text-2xl font-black text-[#E2C48A]">{mm.views?.total ?? 0}</div>
              <div className="text-xs text-[#C9A86A] mt-1">Ø {viewsPerMessage.toFixed(1)} pro Nachricht</div>
            </div>
            <div className="bg-gradient-to-br from-green-950/40 to-green-900/20 border border-green-500/30 rounded-xl p-5 shadow-lg">
              <div className="text-[10px] font-black text-green-300 uppercase tracking-widest mb-2">Einnahmen</div>
              <div className="text-2xl font-black text-green-100">${mm.earnings?.total ?? 0}</div>
              <div className="text-xs text-green-400 mt-1">Massnachrichten (30 Tage)</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-center bg-[#0A0A0A] border border-[#9C7A3D]/30 rounded-xl p-5 mb-6">
            <CircularProgress
              value={daysWithActivity}
              max={chartData.length || 30}
              label={`${daysWithActivity}`}
              sublabel={`von ${chartData.length || 30} Tagen`}
            />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#C9A86A] mb-1">Aktivität (letzte 30 Tage)</h2>
              <p className="text-xs text-slate-500 mb-3">An wie vielen Tagen eine Massnachricht rausging</p>
              {chartData.length > 0 && (
                <Sparkline data={chartData.map((d: any) => ({ label: d.date, value: d.count || 0 }))} />
              )}
            </div>
          </div>

          <p className="text-[10px] text-slate-500">
            Zeigt aktuell nur Massnachrichten der letzten 30 Tage. Gesamter Chat-Nachrichtenverkehr und ein
            Monatsvergleich über einen längeren Zeitraum sind noch nicht angebunden.
          </p>
        </>
      )}

      {loaded && !mm && !error && (
        <div className="text-sm text-slate-500">Keine Statistikdaten verfügbar.</div>
      )}
    </div>
  );
}
