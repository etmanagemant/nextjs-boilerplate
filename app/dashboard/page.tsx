"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  const [gesamtUmsatzAgentur, setGesamtUmsatzAgentur] = useState<number>(0);
  const [eigenerUmsatzChatter, setEigenerUmsatzChatter] = useState<number>(0);
  const [userStatsArray, setUserStatsArray] = useState<any[]>([]);
  
  const [unassignedRevenues, setUnassignedRevenues] = useState<any[]>([]);
  const [selectedChatterForTransfer, setSelectedChatterForTransfer] = useState<Record<number, string>>({});

  async function ladeLiveDaten() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUserId(user.id);
      const adminCheck = user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
      setIsAdmin(adminCheck);

      const [profilesRes, assignmentsRes, revenueRes, modelsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email"),
        supabase.from("shift_assignments").select("*"),
        supabase.from("chatter_revenues").select("*"),
        supabase.from("models").select("id, name")
      ]);

      const profiles = profilesRes.data || [];
      const assignments = assignmentsRes.data || [];
      const revenues = revenueRes.data || [];
      const models = modelsRes.data || [];

      const statsPerUser: Record<string, { name: string; email: string; hours: number; revenue: number }> = {};

      profiles.forEach(p => {
        statsPerUser[p.user_id] = { name: p.full_name || "Mitarbeiter", email: p.email || "", hours: 0, revenue: 0 };
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

      let eigenerSummenZaehler = 0;
      const unassignedList: any[] = [];

      revenues.forEach((r: any) => {
        const zielId = r.user_id || r.chatter_id;
        
        if (zielId === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" && adminCheck) {
          const modelName = models.find(m => m.id === r.model_id)?.name || "Unbekanntes Model";
          unassignedList.push({ ...r, modelName });
        }

        if (zielId && statsPerUser[zielId]) { statsPerUser[zielId].revenue += Number(r.amount || 0); }
        if (zielId === user.id) { eigenerSummenZaehler += Number(r.amount || 0); }
      });

      setGesamtUmsatzAgentur(revenues.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0));
      setEigenerUmsatzChatter(eigenerSummenZaehler);
      setUnassignedRevenues(unassignedList);
      
      const sortiertesArray = Object.values(statsPerUser).sort((a: any, b: any) => b.revenue - a.revenue);
      setUserStatsArray(sortiertesArray);
      setLoading(false);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    ladeLiveDaten();
    const interval = setInterval(ladeLiveDaten, 5000);
    return () => clearInterval(interval);
  }, [supabase]);

  async function handleTransferRevenue(revenueId: number) {
    const targetChatterId = selectedChatterForTransfer[revenueId];
    if (!targetChatterId) return;
    const { error } = await supabase.from("chatter_revenues").update({ user_id: targetChatterId }).eq("id", revenueId);
    if (!error) { ladeLiveDaten(); }
  }

  if (loading) return <div className="text-center pt-24 font-bold text-[#D4AF37] animate-pulse">Lade Live-Dashboard...</div>;
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">ET Performance Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">Echtzeit-Umsätze & Agentur-Rangliste</p>
      </div>

      {/* Exklusive Admin Zuweisungsbox */}
      {isAdmin && unassignedRevenues.length > 0 && (
        <section className="mb-8 bg-amber-950/20 p-5 rounded-xl border-2 border-[#D4AF37]/40 shadow-xl">
          <h2 className="text-xs font-black text-[#D4AF37] uppercase tracking-widest mb-3">⚠️ Offene Trinkgelder / Unzugeordnete Einnahmen ({unassignedRevenues.length})</h2>
          <p className="text-[11px] text-slate-400 mb-4">Hier landen alle Einnahmen, die keinem Chatter zugeordnet werden konnten. Weise sie manuell zu:</p>
          <div className="space-y-2">
            {unassignedRevenues.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#050505] p-3 rounded-lg border border-[#AA7C11]/20 gap-3 text-xs">
                <div>
                  <span className="font-bold text-white block">Betrag: ${Number(r.amount).toFixed(2)}</span>
                  <span className="text-[10px] text-slate-400 font-mono">Model: {r.modelName} | Zeit: {new Date(r.created_at).toLocaleTimeString('de-DE')}</span>
                </div>
                <div className="flex gap-2 items-center w-full sm:w-auto">
                  <select 
                    value={selectedChatterForTransfer[r.id] || ""} 
                    onChange={(e) => setSelectedChatterForTransfer({...selectedChatterForTransfer, [r.id]: e.target.value})}
                    className="bg-black border border-[#AA7C11]/30 rounded p-1.5 text-xs text-white outline-none flex-1 sm:flex-none cursor-pointer"
                  >
                    <option value="">Mitarbeiter wählen...</option>
                    {userStatsArray.filter(u => u.email !== "etmanagemant@gmail.com" && u.email !== "etmanagement@gmail.com").map(u => (
                      <option key={u.email} value={userStatsArray.find(x => x.email === u.email)?.user_id}>{u.name}</option>
                    ))}
                  </select>
                  <button onClick={() => handleTransferRevenue(r.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded text-[11px] uppercase tracking-wide cursor-pointer transition">Zuweisen</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kacheln */}
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

      {/* Rangliste */}
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
                const istEigenerRow = user.revenue === eigenerUmsatzChatter && eigenerUmsatzChatter > 0 && !isAdmin;
                return (
                  <tr key={idx} className={`border-b border-[#AA7C11]/5 transition ${istEigenerRow ? "bg-[#AA7C11]/20 font-bold text-white" : "hover:bg-black/20"}`}>
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
