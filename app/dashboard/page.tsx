"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("chatter");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  const [gesamtBruttoAgentur, setGesamtBruttoAgentur] = useState<number>(0);
  const [gesamtNettoAgentur, setGesamtNettoAgentur] = useState<number>(0);
  const [chatterBrutto, setChatterBrutto] = useState<number>(0);
  const [chatterNetto, setChatterNetto] = useState<number>(0);
  const [userStatsArray, setUserStatsArray] = useState<any[]>([]);
  const [modelStatsArray, setModelStatsArray] = useState<any[]>([]);
  
  const [unassignedRevenues, setUnassignedRevenues] = useState<any[]>([]);
  const [selectedChatterForTransfer, setSelectedChatterForTransfer] = useState<Record<number, string>>({});
  
  // Moderator-specific stats
  const [moderatorStriptchatStats, setModeratorStriptchatStats] = useState<any>(null);

  async function ladeLiveDaten() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUserId(user.id);
      const adminCheck = user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
      setIsAdmin(adminCheck);
      
      // Lade Benutzer-Role
      const { data: userProfile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
      if (userProfile?.role) {
        setCurrentUserRole(userProfile.role);
      }

      const [profilesRes, assignmentsRes, revenueRes, modelsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email"),
        supabase.from("shift_assignments").select("*"),
        supabase.from("chatter_revenues").select("*"),
        supabase.from("models").select("id, name, platform_type")
      ]);

      const profiles = profilesRes.data || [];
      const assignments = assignmentsRes.data || [];
      const revenues = revenueRes.data || [];
      const models = modelsRes.data || [];

      // MODERATOR-SPEZIFISCH: Stripchat Stats berechnen
      if (userProfile?.role === "moderator") {
        let striptchatBrutto = 0;
        let striptchatNetto = 0;
        let totalPrivateShowHours = 0;
        let totalPrivateShowCount = 0; // 🎁 NEUE METRIK für Prämien-Tracking
        
        // Berechne Stripchat-Umsätze nur für diesen Moderator
        revenues.forEach((r: any) => {
          if (r.user_id === user.id && r.platform === "stripchat") {
            striptchatBrutto += Number(r.gross_amount || 0);
            striptchatNetto += Number(r.amount || 0);
          }
        });
        
        // Berechne Private-Show-Stunden & Private-Show-Anzahl
        assignments.forEach((a: any) => {
          if (a.chatter_id === user.id) {
            if (a.privateshow_total_hours) {
              totalPrivateShowHours += Number(a.privateshow_total_hours);
            }
            if (a.privateshow_count) {
              totalPrivateShowCount += Number(a.privateshow_count);
            }
          }
        });
        
        setModeratorStriptchatStats({
          striptchatBrutto,
          striptchatNetto,
          totalPrivateShowHours,
          totalPrivateShowCount, // 🎁 Hinzugefügt
        });
      }

      const statsPerUser: Record<string, { user_id: string; name: string; email: string; hours: number; brutto: number; netto: number }> = {};
      const statsPerModel: Record<string, { name: string; brutto: number; netto: number }> = {};
      
      // 🎭 NEUES MAPPING: Model-ID zu platform_type für schnelle Filterung
      const modelPlatformMap: Record<string, string> = {};
      models.forEach(m => {
        statsPerModel[m.id] = { name: m.name || "Unbekannt", brutto: 0, netto: 0 };
        modelPlatformMap[m.id] = m.platform_type || "onlyfans";
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
        const nettoWert = Number(r.amount || (r.gross_amount * 0.8) || 0);

        // 🔐 FILTERUNG NACH BENUTZER-ROLLE & REVENUE-PLATFORM
        let shouldCountForUser = true;
        let shouldCountForModel = true;

        if (userProfile?.role === "chatter") {
          // Chatter sieht nur OnlyFans-Umsätze
          shouldCountForUser = r.platform !== "stripchat";
          shouldCountForModel = r.platform !== "stripchat";
        } else if (userProfile?.role === "moderator") {
          // Moderator sieht nur Stripchat-Umsätze
          shouldCountForUser = r.platform === "stripchat";
          shouldCountForModel = r.platform === "stripchat";
        }
        // Admin sieht alles (shouldCountForUser und shouldCountForModel bleiben true)

        if (zielId && statsPerUser[zielId] && shouldCountForUser) {
          statsPerUser[zielId].brutto += bruttoWert;
          statsPerUser[zielId].netto += nettoWert;
        }

        // 👑 MODEL RANGLISTE STATS ZUORDNEN (MIT PLATFORM-FILTERUNG)
        if (r.model_id && statsPerModel[r.model_id] && shouldCountForModel) {
          statsPerModel[r.model_id].brutto += bruttoWert;
          statsPerModel[r.model_id].netto += nettoWert;
        }
        
        if (zielId === user.id && r.platform !== "stripchat") {
          // Zähle nur NonStripchat für Moderator-Anzeige in der Chatter-Sektion
          summeBruttoChatter += bruttoWert;
          summeNettoChatter += nettoWert;
        } else if (zielId === user.id && !userProfile?.role) {
          // Für normale Chatter: alles zählen
          summeBruttoChatter += bruttoWert;
          summeNettoChatter += nettoWert;
        }
      });

      setGesamtBruttoAgentur(revenues.reduce((sum: number, r: any) => sum + Number(r.gross_amount || r.amount || 0), 0));
      setGesamtNettoAgentur(revenues.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0));
      setChatterBrutto(summeBruttoChatter);
      setChatterNetto(summeNettoChatter);
      setUnassignedRevenues(unassignedList);
      
      // 🎭 MODELL-FILTERUNG NACH PLATTFORM-TYP
      let filteredModelStats = Object.entries(statsPerModel)
        .filter(([modelId]) => {
          const platformType = modelPlatformMap[modelId] || "onlyfans";
          
          if (isAdmin) return true; // Admin sieht alles
          
          if (userProfile?.role === "chatter") {
            // Chatter sieht nur OnlyFans/Both Models
            return platformType === "onlyfans" || platformType === "both";
          } else if (userProfile?.role === "moderator") {
            // Moderator sieht nur Stripchat/Both Models
            return platformType === "stripchat" || platformType === "both";
          }
          return true;
        })
        .map(([_, stat]) => stat)
        .sort((a: any, b: any) => b.netto - a.netto);
      
      setUserStatsArray(Object.values(statsPerUser).sort((a: any, b: any) => b.netto - a.netto));
      setModelStatsArray(filteredModelStats);
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
  
  // MODERATOR-SPEZIFISCHES DASHBOARD
  if (currentUserRole === "moderator" && moderatorStriptchatStats) {
    return (
      <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
        <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
          <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">🎭 Stripchat Dashboard</h1>
          <p className="text-xs text-slate-400 mt-1">Deine persönlichen Stripchat-Session-Daten & Umsätze</p>
        </div>

        {/* KPI Boxen */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-purple-950/40 to-purple-900/20 border border-purple-500/30 rounded-xl p-5 shadow-lg">
            <div className="text-[10px] font-black text-purple-300 uppercase tracking-widest mb-2">Stripchat Brutto</div>
            <div className="text-2xl font-black text-purple-100">${moderatorStriptchatStats.striptchatBrutto.toFixed(2)}</div>
            <div className="text-xs text-purple-400 mt-1">Gesamt-Umsatz</div>
          </div>

          <div className="bg-gradient-to-br from-green-950/40 to-green-900/20 border border-green-500/30 rounded-xl p-5 shadow-lg">
            <div className="text-[10px] font-black text-green-300 uppercase tracking-widest mb-2">Stripchat Netto</div>
            <div className="text-2xl font-black text-green-100">${moderatorStriptchatStats.striptchatNetto.toFixed(2)}</div>
            <div className="text-xs text-green-400 mt-1">Nach Plattformgebühr</div>
          </div>

          <div className="bg-gradient-to-br from-blue-950/40 to-blue-900/20 border border-blue-500/30 rounded-xl p-5 shadow-lg">
            <div className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-2">Privat-Show Stunden</div>
            <div className="text-2xl font-black text-blue-100">{moderatorStriptchatStats.totalPrivateShowHours.toFixed(2)}h</div>
            <div className="text-xs text-blue-400 mt-1">Gesamt-Zeit</div>
          </div>
        </section>
      </main>
    );
  }
  
  // ADMIN DASHBOARD (Original)
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
