"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  // Umsatz- und Performance-Zustände
  const [gesamtUmsatzAgentur, setGesamtUmsatzAgentur] = useState<number>(0);
  const [eigenerUmsatzChatter, setEigenerUmsatzChatter] = useState<number>(0);
  const [userStatsArray, setUserStatsArray] = useState<any[]>([]);

  useEffect(() => {
    async function ladeLiveDaten() {
      try {
        // 1. Benutzer-ID und Rolle prüfen
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        setCurrentUserId(user.id);
        const adminCheck = user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
        setIsAdmin(adminCheck);

        // 2. Tabellen abrufen
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

        // Schichtstunden berechnen
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

        // Einnahmen summieren
        let eigenerSummenZaehler = 0;
        revenues.forEach((r: any) => {
          const zielId = r.user_id || r.chatter_id;
          if (zielId && statsPerUser[zielId]) {
            statsPerUser[zielId].revenue += Number(r.amount || 0);
          }
          if (zielId === user.id) {
            eigenerSummenZaehler += Number(r.amount || 0);
          }
        });

        setGesamtUmsatzAgentur(revenues.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0));
        setEigenerUmsatzChatter(eigenerSummenZaehler);
        
        // Sortiert die Mitarbeiter-Tabelle direkt nach dem höchsten Umsatz (Ranking-System!)
        const sortiertesArray = Object.values(statsPerUser).sort((a: any, b: any) => b.revenue - a.revenue);
        setUserStatsArray(sortiertesArray);
        setLoading(false);
      } catch (e) {
        console.error(e);
      }
    }

    ladeLiveDaten();
    const interval = setInterval(ladeLiveDaten, 5000); // Automatisches Neuladen alle 5 Sekunden
    return () => clearInterval(interval);
  }, [supabase]);

  if (loading) return <div className="text-center pt-24 font-bold text-[#D4AF37] animate-pulse">Lade Live-Dashboard...</div>;

  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">ET Performance Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">Echtzeit-Umsätze & Agentur-Rangliste</p>
      </div>

      {/* Dynamische Kacheln basierend auf Admin / Chatter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg text-center">
          {isAdmin ? (
            <>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Gesamtumsatz Agentur (Admin-Sicht)</div>
              <div className="text-4xl font-black text-[#D4AF37] mt-2 font-mono">${gesamtUmsatzAgentur.toFixed(2)}</div>
            </>
          ) : (
            <>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dein generierter Live-Umsatz</div>
              <div className="text-4xl font-black text-emerald-400 mt-2 font-mono">${eigenerUmsatzChatter.toFixed(2)}</div>
            </>
          )}
        </div>
        <div className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg text-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Team-Platzierung</div>
          <div className="text-4xl font-black text-[#D4AF37] mt-2 font-mono">
            🏆 #{userStatsArray.findIndex(u => u.revenue === eigenerUmsatzChatter) + 1} / {userStatsArray.length}
          </div>
        </div>
      </div>

      {/* Rangliste (Für jeden sichtbar) */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">Agentur Live-Rangliste</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#AA7C11]/10 bg-[#050505] text-[#D4AF37] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3 w-12">Rang</th>
                <th className="p-3">Mitarbeiter</th>
                <th className="p-3">Arbeitszeit</th>
                <th className="p-3">Umsatz Leistung</th>
                <th className="p-3 text-emerald-400">Ø / Stunde</th>
              </tr>
            </thead>
            <tbody>
              {userStatsArray.map((user, idx) => {
                const usdPerHr = user.hours > 0 ? user.revenue / user.hours : 0;
                return (
                  <tr key={idx} className={`border-b border-[#AA7C11]/5 transition ${user.revenue === eigenerUmsatzChatter && eigenerUmsatzChatter > 0 ? "bg-[#AA7C11]/20 font-bold text-white scale-[1.01]" : "hover:bg-black/20"}`}>
                    <td className="p-3 font-mono font-black text-[#D4AF37]">#{idx + 1}</td>
                    <td className="p-3 text-white tracking-wide">{user.name}</td>
                    <td className="p-3 font-mono text-slate-400">{user.hours.toFixed(2)} h</td>
                    <td className="p-3 font-mono text-slate-200">${user.revenue.toFixed(2)}</td>
                    <td className="p-3 font-mono text-emerald-400">${usdPerHr.toFixed(2)}/h</td>
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
