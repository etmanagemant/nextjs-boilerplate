"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  const [gesamtBruttoAgentur, setGesamtBruttoAgentur] = useState<number>(0);
  const [gesamtNettoAgentur, setGesamtNettoAgentur] = useState<number>(0);
  const [chatterBrutto, setChatterBrutto] = useState<number>(0);
  const [chatterNetto, setChatterNetto] = useState<number>(0);
  const [userStatsArray, setUserStatsArray] = useState<any[]>([]);
  const [modelStatsArray, setModelStatsArray] = useState<any[]>([]);
  
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

      const statsPerUser: Record<string, { user_id: string; name: string; email: string; hours: number; brutto: number; netto: number }> = {};
      const statsPerModel: Record<string, { name: string; brutto: number; netto: number }> = {};

      models.forEach(m => {
        statsPerModel[m.id] = { name: m.name || "Unbekannt", brutto: 0, netto: 0 };
      });

      profiles.forEach(p => {
        // 🛡️ ADMIN-SICHT-FIX: Du wirst hier wieder voll erfasst und fliegst nicht mehr raus!
        statsPerUser[p.user_id] = { user_id: p.user_id, name: p.full_name || "Mitarbeiter", email: p.email || "", hours: 0, brutto: 0, netto: 0 };
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

      let summeBruttoChatter = 0;
      let summeNettoChatter = 0;
      const unassignedList: any[] = [];

      revenues.forEach((r: any) => {
        const zielId = r.user_id || r.chatter_id;
        
        if (zielId === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" && adminCheck) {
          const modelName = models.find(m => m.id === r.model_id)?.name || "Unbekanntes Model";
          unassignedList.push({ ...r, modelName });
        }

        const bruttoWert = Number(r.gross_amount || r.amount || 0);
        const nettoWert = Number(r.amount || 0);

        if (zielId && statsPerUser[zielId]) {
          statsPerUser[zielId].brutto += bruttoWert;
          statsPerUser[zielId].netto += nettoWert;
        }

        // 👑 MODEL RANGLISTE STATS ZUORDNEN
        if (r.model_id && statsPerModel[r.model_id]) {
          statsPerModel[r.model_id].brutto += bruttoWert;
          statsPerModel[r.model_id].netto += nettoWert;
        }
        
        if (zielId === user.id) {
          summeBruttoChatter += bruttoWert;
          summeNettoChatter += nettoWert;
        }
      });

      setGesamtBruttoAgentur(revenues.reduce((sum: number, r: any) => sum + Number(r.gross_amount || r.amount || 0), 0));
      setGesamtNettoAgentur(revenues.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0));
      setChatterBrutto(summeBruttoChatter);
      setChatterNetto(summeNettoChatter);
      setUnassignedRevenues(unassignedList);
      
      setUserStatsArray(Object.values(statsPerUser).sort((a: any, b: any) => b.netto - a.netto));
      setModelStatsArray(Object.values(statsPerModel).sort((a: any, b: any) => b.netto - a.netto));
      setLoading(false);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    ladeLiveDaten();
    const interval = setInterval(ladeLiveDaten, 5000);
    return () => clearInterval(interval);
  }, [supabase]);

  async function handleTransferRevenue(revenueId: number, currentAmount: number) {
    const targetChatterId = selectedChatterForTransfer[revenueId];
    if (!targetChatterId) return;

    const bruttoBetrag = currentAmount;
    const nettoBetrag = bruttoBetrag * 0.80;

    const { error } = await supabase
      .from("chatter_revenues")
      .update({ user_id: targetChatterId, amount: nettoBetrag, gross_amount: bruttoBetrag })
      .eq("id", revenueId);

    if (!error) { ladeLiveDaten(); }
  }

  if (loading) return <div className="text-center pt-24 font-bold text-[#D4AF37] animate-pulse">Lade Live-Dashboard...</div>;
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">ET Performance Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">Echtzeit-Umsatzauswertungen & Performancedaten</p>
      </div>

      {/* Zuweisungsbox */}
      {isAdmin && unassignedRevenues.length > 0 && (
        <section className="mb-8 bg-amber-950/20 p-5 rounded-xl border-2 border-[#D4AF37]/40 shadow-xl">
          <h2 className="text-xs font-black text-[#D4AF37] uppercase tracking-widest mb-3">⚠️ Offene Einnahmen & Tips Pool ({unassignedRevenues.length})</h2>
          <div className="space-y-2">
            {unassignedRevenues.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#050505] p-3 rounded-lg border border-[#AA7C11]/20 gap-3 text-xs">
                <div>
                  <span className="font-bold text-white block">Eingegangener Tip: ${Number(r.amount).toFixed(2)}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Model-Herkunft: {r.modelName}</span>
                </div>
                <div className="flex gap-2 items-center w-full sm:w-auto">
                  <select 
                    value={selectedChatterForTransfer[r.id] || ""} 
                    onChange={(e) => setSelectedChatterForTransfer({...selectedChatterForTransfer, [r.id]: e.target.value})}
                    className="bg-black border border-[#AA7C11]/30 rounded p-1.5 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="">Chatter wählen...</option>
                    {userStatsArray.filter(u => u.name !== "Tobias").map((u: any) => (
                      <option key={u.email} value={u.user_id}>{u.name}</option>
                    ))}
                  </select>
                  <button onClick={() => handleTransferRevenue(r.id, r.amount)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded text-[11px] uppercase tracking-wide cursor-pointer transition">Zuweisen</button>
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
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Agentur-Umsatz (Admin)</div>
              <div className="text-3xl font-black text-[#D4AF37] mt-2 font-mono">${gesamtBruttoAgentur.toFixed(2)} <span className="text-xs text-slate-400 font-normal">Brutto</span></div>
              <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">${gesamtNettoAgentur.toFixed(2)} <span className="text-xs text-slate-400 font-normal">Netto</span></div>
            </>
          ) : (
            <>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Deine Umsatz-Leistung</div>
              <div className="text-3xl font-black text-[#D4AF37] mt-2 font-mono">${chatterBrutto.toFixed(2)} <span className="text-xs text-slate-400 font-normal">Brutto</span></div>
              <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">${chatterNetto.toFixed(2)} <span className="text-xs text-slate-400 font-normal">Netto</span></div>
            </>
          )}
        </div>
        <div className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg text-center flex flex-col justify-center items-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Agentur Ranglisten-Platz</div>
          <div className="text-4xl font-black text-[#D4AF37] mt-2 font-mono">
            🏆 #{userStatsArray.findIndex(u => u.brutto === chatterBrutto) + 1} / {userStatsArray.length}
          </div>
        </div>
      </div>

      {/* Rangliste Mitarbeiter */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg mb-8">
        <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">Mitarbeiter Live-Rangliste</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#AA7C11]/10 bg-[#050505] text-[#D4AF37] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3 w-12">Rang</th>
                <th className="p-3">Mitarbeiter</th>
                <th className="p-3">Arbeitszeit</th>
                <th className="p-3 text-amber-200">Umsatz Brutto</th>
                <th className="p-3 text-emerald-400">Umsatz Netto</th>
                <th className="p-3 text-slate-400">Ø Netto / h</th>
              </tr>
            </thead>
            <tbody>
              {userStatsArray.map((user, idx) => {
                const usdPerHr = user.hours > 0 ? user.netto / user.hours : 0;
                return (
                  <tr key={idx} className="border-b border-[#AA7C11]/5 hover:bg-black/20 transition">
                    <td className="p-3 font-mono font-black text-[#D4AF37]">#{idx + 1}</td>
                    <td className="p-3 font-semibold text-white tracking-wide">{user.name}</td>
                    <td className="p-3 font-mono text-slate-400">{user.hours.toFixed(2)} h</td>
                    <td className="p-3 font-mono text-amber-200/80">${user.brutto.toFixed(2)}</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">${user.netto.toFixed(2)}</td>
                    <td className="p-3 font-mono text-slate-300">${usdPerHr.toFixed(2)}/h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 👑 NEUE MODEL RANGLISTE (Vollautomatisch basierend auf der Herkunft der Einnahmen!) */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#AA7C11] uppercase tracking-wider">Model Live-Umsatz-Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#AA7C11]/10 bg-[#050505] text-[#AA7C11] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3 w-12">Platz</th>
                <th className="p-3">Model Name</th>
                <th className="p-3 text-amber-200">Generiert Brutto</th>
                <th className="p-3 text-emerald-400">Netto Account-Eingang</th>
              </tr>
            </thead>
            <tbody>
              {modelStatsArray.map((model, idx) => (
                <tr key={idx} className="border-b border-[#AA7C11]/5 hover:bg-black/20 transition">
                  <td className="p-3 font-mono font-black text-[#D4AF37]">#{idx + 1}</td>
                  <td className="p-3 font-semibold text-white tracking-wide">✨ {model.name}</td>
                  <td className="p-3 font-mono text-amber-200/80">${model.brutto.toFixed(2)}</td>
                  <td className="p-3 font-mono font-bold text-emerald-400">${model.netto.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
