"use client";

import { useEffect, useState } from "react";
// 🛡️ IMPORT-FIX: Holt deinen echten Browser-Client aus dem lib-Verzeichnis!
import { createClient } from "../../lib/supabaseClient";

export default function DashboardPage() {
  const supabase = createClient();
  const [gesamtUmsatzAgentur, setGesamtUmsatzAgentur] = useState<number>(0);
  const [userStatsArray, setUserStatsArray] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function ladeLiveDaten() {
      try {
        const [profilesRes, assignmentsRes, revenueRes] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name, email"),
          supabase.from("shift_assignments").select("*"),
          supabase.from("chatter_revenues").select("*")
        ]);

        const profiles = profilesRes.data || [];
        const assignments = assignmentsRes.data || [];
        const revenues = revenueRes.data || [];

        const statsPerUser: Record<string, { name: string; email: string; hours: number; revenue: number }> = {};

        profiles.forEach(p => {
          statsPerUser[p.user_id] = {
            name: p.full_name || "Mitarbeiter",
            email: p.email || "",
            hours: 0,
            revenue: 0
          };
        });

        assignments.forEach((a: any) => {
          const tatsaechlicheChatterId = a.chatter_id || a.user_id;
          if (tatsaechlicheChatterId && a.started_at && statsPerUser[tatsaechlicheChatterId]) {
            const start = new Date(a.started_at).getTime();
            const end = a.ended_at ? new Date(a.ended_at).getTime() : Date.now();
            if (end > start) {
              statsPerUser[tatsaechlicheChatterId].hours += (end - start) / (1000 * 60 * 60);
            }
          }
        });

        revenues.forEach((r: any) => {
          const zielId = r.user_id || r.chatter_id;
          if (zielId && statsPerUser[zielId]) {
            statsPerUser[zielId].revenue += Number(r.amount || 0);
          }
        });

        const summe = revenues.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
        
        setGesamtUmsatzAgentur(summe);
        setUserStatsArray(Object.values(statsPerUser));
        setLoading(false);
      } catch (e) {
        console.error("Fehler beim Live-Abruf:", e);
      }
    }

    ladeLiveDaten();
    const interval = setInterval(ladeLiveDaten, 5000);
    return () => clearInterval(interval);
  }, [supabase]);

  if (loading) {
    return <div className="text-center pt-24 font-bold text-[#D4AF37] animate-pulse">Synchronisiere Live-Umsatz-Dashboard...</div>;
  }

  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">ET Live Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">Echtzeit-Performance & Umsatz-Monitoring (Aktualisiert sich automatisch)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg text-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Gesamtumsatz</div>
          <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] mt-2 tracking-wide font-mono">
            ${gesamtUmsatzAgentur.toFixed(2)}
          </div>
        </div>
        <div className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg text-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aktive Profile</div>
          <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] mt-2 tracking-wide font-mono">
            {userStatsArray.length}
          </div>
        </div>
      </div>

      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">Mitarbeiter Live-Leistung</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#AA7C11]/10 bg-[#050505] text-[#D4AF37] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3">Mitarbeiter</th>
                <th className="p-3">E-Mail</th>
                <th className="p-3">Arbeitszeit</th>
                <th className="p-3">Generierter Umsatz</th>
                <th className="p-3 text-emerald-400">Umsatz / Stunde</th>
              </tr>
            </thead>
            <tbody>
              {userStatsArray.map((user: any, idx: number) => {
                const usdPerHr = user.hours > 0 ? user.revenue / user.hours : 0;
                return (
                  <tr key={idx} className="border-b border-[#AA7C11]/5 hover:bg-black/20 transition">
                    <td className="p-3 font-semibold text-white tracking-wide">{user.name}</td>
                    <td className="p-3 text-slate-400 font-mono text-xs">{user.email}</td>
                    <td className="p-3 font-mono text-slate-300">{user.hours.toFixed(2)} h</td>
                    <td className="p-3 font-mono font-bold text-slate-200">${user.revenue.toFixed(2)}</td>
                    <td className="p-3 font-mono font-black text-emerald-400">${usdPerHr.toFixed(2)}/h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
