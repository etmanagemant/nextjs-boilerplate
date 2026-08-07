"use client";

import { useEffect, useState } from "react";
import { RevenueChart } from "@/components/layout/RevenueChart";

/**
 * Model's own OnlyFans stats (Task #67, ueberarbeitet 2026-08-07 - explizit
 * gewuenscht: Massnachrichten-Zahlen raus, stattdessen derselbe navigierbare
 * RevenueChart wie im Dashboard, Auszahlung immer sichtbar statt Toggle.
 * /api/crm/revenue-timeseries loest die eigene ModelID server-seitig ueber
 * owner_user_id auf (role:"model"), kein modelId-Query-Param noetig.
 */
export default function ModelOnlyFansStatsClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [earnings, setEarnings] = useState<any>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/model-onlyfans-stats");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden");
      setEarnings(data.earnings || null);
    } catch (e: any) {
      setError(e.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent uppercase tracking-wider">
          OnlyFans Statistik
        </h1>
      </div>

      {error && <div className="text-sm text-red-400 mb-4">{error}</div>}
      {loading && <div className="text-sm text-slate-500 italic mb-4">Lade…</div>}

      {earnings && (
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

      <RevenueChart isAdmin={false} />
    </div>
  );
}
