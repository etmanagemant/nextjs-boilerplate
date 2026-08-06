"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabaseClient";
import { hasRole, isAdminTierRole } from "../../lib/roles";
import { CircularProgress, MiniBarChart } from "@/components/layout/StatViz";
import { RevenueChart } from "@/components/layout/RevenueChart";
import { SettingsIcon, MailIcon } from "@/components/layout/GoldIcons";

// Task #85: consistent zero-padded 24h format for the new shift overview,
// matching this app's convention elsewhere (see app/chatter/page.tsx).
function formatDashboardDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDurationHours(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, end - start) / (1000 * 60 * 60);
}

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("chatter");
  const [currentSecondaryRole, setCurrentSecondaryRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  const [gesamtBruttoAgentur, setGesamtBruttoAgentur] = useState<number>(0);
  const [gesamtNettoAgentur, setGesamtNettoAgentur] = useState<number>(0);
  const [chatterBrutto, setChatterBrutto] = useState<number>(0);
  const [chatterNetto, setChatterNetto] = useState<number>(0);
  const [userStatsArray, setUserStatsArray] = useState<any[]>([]);
  const [modelStatsArray, setModelStatsArray] = useState<any[]>([]);
  
  const [unassignedRevenues, setUnassignedRevenues] = useState<any[]>([]);
  const [selectedChatterForTransfer, setSelectedChatterForTransfer] = useState<Record<number, string>>({});
  const [abandonedLeads, setAbandonedLeads] = useState<any[]>([]);
  // Task #85: admin-only overview of the 10 most recent shifts across everyone
  const [recentShifts, setRecentShifts] = useState<any[]>([]);
  
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
      const { data: userProfile } = await supabase.from("profiles").select("role, secondary_role").eq("user_id", user.id).maybeSingle();
      if (userProfile?.role) {
        setCurrentUserRole(userProfile.role);
      }
      setCurrentSecondaryRole(userProfile?.secondary_role || null);

      // Explizit gewünscht (2026-08-06, "Dashboard aufräumen"): Umsatz und
      // Arbeitszeit zeigen nur noch HEUUTE, nicht mehr die komplette
      // All-Time-Summe seit Projektbeginn (inkl. altem Testdaten-Rauschen).
      // Lokaler Tagesbeginn im Browser des jeweiligen Nutzers, nicht UTC.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartIso = todayStart.toISOString();

      const [profilesRes, assignmentsRes, revenueRes, modelsRes, abandonedLeadsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email"),
        supabase.from("shift_assignments").select("*").gte("started_at", todayStartIso),
        supabase.from("chatter_revenues").select("*").gte("created_at", todayStartIso),
        supabase.from("models").select("id, name, platform_type"),
        supabase.from("abandoned_leads").select("*").order("abandoned_at", { ascending: false }).limit(50)
      ]);

      const profiles = profilesRes.data || [];
      const assignments = assignmentsRes.data || [];
      const revenues = revenueRes.data || [];
      const models = modelsRes.data || [];
      const abandoned = abandonedLeadsRes.data || [];

      // Task #85: admin-only "last 10 shifts" - reuses the assignments
      // already fetched above instead of a second query.
      if (adminCheck) {
        const sorted = assignments
          .filter((a: any) => a.started_at)
          .slice()
          .sort((a: any, b: any) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
          .slice(0, 10)
          .map((a: any) => ({
            ...a,
            chatterName: profiles.find((p: any) => p.user_id === (a.chatter_id || a.user_id))?.full_name || "Unbekannt",
            modelName: models.find((m: any) => m.id === a.model_id)?.name || "—",
          }));
        setRecentShifts(sorted);
      }

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
        
        // 🔴 NUR unzugeordnete Tips anzeigen (assigned_to_chatter = false)
        // So können Admins die auch als Chatter arbeiten, ihre eigenen Revenues behalten
        if (zielId === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" && adminCheck && r.assigned_to_chatter === false) {
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
      setAbandonedLeads(abandoned);
      
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
      .update({ 
        user_id: targetChatterId, 
        amount: nettoBetrag, 
        gross_amount: bruttoBetrag,
        assigned_to_chatter: true
      })
      .eq("id", revenueId);

    if (!error) { ladeLiveDaten(); }
  }

  if (loading) return <div className="text-center pt-24 font-bold text-[#C9A86A] animate-pulse">Lade Live-Dashboard...</div>;
  
  // MODERATOR-SPEZIFISCHES DASHBOARD
  if (currentUserRole === "moderator" && moderatorStriptchatStats) {
    return (
      <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#E2C48A] rounded-2xl my-6 border border-white/5 shadow-2xl">
        <div className="mb-6 border-b border-white/5 pb-4">
          <h1 className="text-2xl font-black uppercase tracking-wider"><span className="bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent">Stripchat Dashboard</span></h1>
          <p className="text-xs text-slate-400 mt-1">Deine persönlichen Stripchat-Session-Daten & Umsätze</p>
        </div>

        {/* KPI Boxen */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-[#3c2f16]/40 to-[#5e4922]/20 border border-[#9C7A3D]/30 rounded-2xl p-5 shadow-lg">
            <div className="text-[10px] font-black text-[#C9A86A] uppercase tracking-widest mb-2">Stripchat Brutto</div>
            <div className="text-2xl font-black text-[#E2C48A]">${moderatorStriptchatStats.striptchatBrutto.toFixed(2)}</div>
            <div className="text-xs text-[#C9A86A] mt-1">Gesamt-Umsatz</div>
          </div>

          <div className="bg-gradient-to-br from-green-950/40 to-green-900/20 border border-green-500/30 rounded-2xl p-5 shadow-lg">
            <div className="text-[10px] font-black text-green-300 uppercase tracking-widest mb-2">Stripchat Netto</div>
            <div className="text-2xl font-black text-green-100">${moderatorStriptchatStats.striptchatNetto.toFixed(2)}</div>
            <div className="text-xs text-green-400 mt-1">Nach Plattformgebühr</div>
          </div>

          <div className="bg-gradient-to-br from-[#3c2f16]/40 to-[#5e4922]/20 border border-[#E5C158]/30 rounded-2xl p-5 shadow-lg">
            <div className="text-[10px] font-black text-[#E5C158] uppercase tracking-widest mb-2">Privat-Show Stunden</div>
            <div className="text-2xl font-black text-[#E2C48A]">{moderatorStriptchatStats.totalPrivateShowHours.toFixed(2)}h</div>
            <div className="text-xs text-[#E5C158] mt-1">Gesamt-Zeit</div>
          </div>
        </section>

        <section className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 hover:border-[#C9A86A]/30 transition-colors duration-300 flex items-center gap-5">
          <CircularProgress
            value={moderatorStriptchatStats.striptchatNetto}
            max={moderatorStriptchatStats.striptchatBrutto || 1}
            label={`${moderatorStriptchatStats.striptchatBrutto > 0 ? Math.round((moderatorStriptchatStats.striptchatNetto / moderatorStriptchatStats.striptchatBrutto) * 100) : 0}%`}
            sublabel="Netto-Anteil"
          />
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Netto/Brutto-Verhältnis</div>
            <div className="text-xl font-black text-[#C9A86A] mt-1">Nach Plattformgebühr</div>
          </div>
        </section>
      </main>
    );
  }
  
  // Task #72: "isAdmin" above is only the hardcoded Hauptadmin check -
  // isAdminTier also covers the DB "admin"/"content-manager" roles.
  // hasChatterAccess covers the chatter+moderator dual-role case (Task #80).
  const isAdminTier = isAdminTierRole(currentUserRole) || isAdmin;
  const hasChatterAccess = hasRole({ role: currentUserRole, secondary_role: currentSecondaryRole }, "chatter");

  // ADMIN DASHBOARD (Original)
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#E2C48A] rounded-2xl my-6 border border-white/5 shadow-2xl">
      <div className="mb-6 border-b border-white/5 pb-4">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent uppercase tracking-wider">Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">Echtzeit-Umsatzauswertungen & Performancedaten - Umsatz und Arbeitszeit zeigen nur heute</p>
      </div>

      {/* Explizit gewuenscht (2026-08-07): Umsatz-Verlauf statt reiner
          "heute"-Zahl, als erstes auf der Seite. Chatter sehen nur ihren
          eigenen Umsatz (userId gesetzt), Admin ohne userId den
          Agentur-Gesamtumsatz. */}
      <RevenueChart userId={isAdmin ? undefined : currentUserId} isAdmin={isAdmin} />

      {/* Zuweisungsbox */}
      {isAdmin && unassignedRevenues.length > 0 && (
        <section className="mb-8 bg-gold-950/20 p-5 rounded-2xl border-2 border-[#C9A86A]/40 shadow-xl">
          <h2 className="text-xs font-black text-[#C9A86A] uppercase tracking-widest mb-3"><span>⚠️</span> <span>Offene Einnahmen & Tips Pool ({unassignedRevenues.length})</span></h2>
          <div className="space-y-2">
            {unassignedRevenues.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#050505] p-3 rounded-lg border border-[#9C7A3D]/20 gap-3 text-xs">
                <div>
                  <span className="font-bold text-white block">Eingegangener Tip: ${Number(r.amount).toFixed(2)}</span>
                  <span className="text-[10px] text-slate-400 block font-mono">Model-Herkunft: {r.modelName}</span>
                </div>
                <div className="flex gap-2 items-center w-full sm:w-auto">
                  <select 
                    value={selectedChatterForTransfer[r.id] || ""} 
                    onChange={(e) => setSelectedChatterForTransfer({...selectedChatterForTransfer, [r.id]: e.target.value})}
                    className="bg-black border border-[#9C7A3D]/30 rounded p-1.5 text-xs text-white outline-none cursor-pointer"
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

      {/* Task #85: admin-only overview of the 10 most recent shifts */}
      {isAdmin && recentShifts.length > 0 && (
        <section className="mb-8 bg-[#050505] p-5 rounded-2xl border border-white/5 shadow-xl">
          <h2 className="text-xs font-black text-[#C9A86A] uppercase tracking-widest mb-3"><span>📊</span> <span>Letzte 10 Schichten</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase text-[10px] tracking-wide border-b border-[#9C7A3D]/10">
                  <th className="text-left p-2">Mitarbeiter</th>
                  <th className="text-left p-2">Plattform</th>
                  <th className="text-left p-2">Model</th>
                  <th className="text-left p-2">Start</th>
                  <th className="text-left p-2">Ende</th>
                  <th className="text-right p-2">Dauer</th>
                </tr>
              </thead>
              <tbody>
                {recentShifts.map((s) => (
                  <tr key={s.id} className="border-b border-[#9C7A3D]/5">
                    <td className="p-2 text-slate-200 font-bold">{s.chatterName}</td>
                    <td className="p-2 text-slate-400">{s.platform === "stripchat" ? "Stripchat" : "OnlyFans"}</td>
                    <td className="p-2 text-slate-400">{s.modelName}</td>
                    <td className="p-2 text-slate-400 font-mono">{formatDashboardDateTime(s.started_at)}</td>
                    <td className="p-2 text-slate-400 font-mono">{s.ended_at ? formatDashboardDateTime(s.ended_at) : "läuft noch"}</td>
                    <td className="p-2 text-[#C9A86A] font-mono text-right">{toDurationHours(s.started_at, s.ended_at).toFixed(2)} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CRM ADMIN PANEL - MODEL VERBINDUNG & SETTINGS */}
      {isAdmin && (
        <section className="mb-6">
          <Link href="/management/crm-connect" className="group block">
            <div className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 hover:border-[#C9A86A]/40 hover:shadow-[0_0_24px_rgba(201,168,106,0.15)] transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-widest text-[#C9A86A] group-hover:text-[#E2C48A] transition-colors">CRM Model-Verbindung & Settings</h2>
                  <p className="text-xs text-slate-400 mt-2">Verwalte OnlyFans Session-Daten, Script-Bibliotheken und Chatter-Emoji-Konfiguration</p>
                </div>
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-xl bg-[#C9A86A]/10 text-[#C9A86A] group-hover:scale-110 group-hover:bg-[#C9A86A]/15 transition-all duration-200">
                  <SettingsIcon size={24} />
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-[#C9A86A] font-bold text-sm group-hover:translate-x-1 transition-transform">
                Zum Admin-Panel <span>→</span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* CRM LIVE INBOX - CHATTER (OnlyFans-only tool - a plain moderator
          is Stripchat-only, see hasChatterAccess/Task #80+#72) */}
      {(hasChatterAccess || isAdminTier) && (
        <section className="mb-8">
          <Link href="/crm-inbox" className="group block">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#C9A86A]/10 via-white/[0.03] to-black/40 backdrop-blur-xl p-8 rounded-2xl border border-[#C9A86A]/30 shadow-2xl hover:border-[#E2C48A]/60 hover:shadow-[0_0_36px_rgba(201,168,106,0.25)] transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-widest text-[#E2C48A] group-hover:text-[#C9A86A] transition-colors">Live-Inbox & Chat-Zentrale (CRM)</h2>
                  <p className="text-sm text-slate-300 mt-3 font-semibold">Verwalte Fan-Konversationen{isAdminTier ? " • Injiziere Sales-Scripts" : ""} • Nutze personalisierte Emoji-Leiste</p>
                  <div className="mt-3 flex gap-3 text-xs font-bold text-[#C9A86A]">
                    <span className="bg-[#C9A86A]/15 px-3 py-1 rounded-lg">Live-Messaging</span>
                    {isAdminTier && <span className="bg-[#C9A86A]/15 px-3 py-1 rounded-lg">Script-Injector</span>}
                    <span className="bg-[#C9A86A]/15 px-3 py-1 rounded-lg">Emoji-Leiste</span>
                  </div>
                </div>
                <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center rounded-2xl bg-[#C9A86A]/10 text-[#C9A86A] group-hover:scale-110 group-hover:bg-[#C9A86A]/15 transition-all duration-200">
                  <MailIcon size={30} />
                </div>
              </div>
              <div className="mt-6 inline-flex items-center gap-2 text-[#C9A86A] font-black text-base group-hover:translate-x-1 transition-transform bg-[#C9A86A]/10 px-4 py-2 rounded-xl border border-[#C9A86A]/20 hover:bg-[#C9A86A]/15">
                Zur Chat-Zentrale öffnen <span>→</span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Ranglisten-Platz-Kachel (reine "heute"-Zahl-Kachel wurde durch den
          RevenueChart oben ersetzt, 2026-08-07) */}
      <div className="mb-8">
        <div className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 hover:border-[#C9A86A]/30 transition-colors duration-300 flex items-center justify-center gap-5 max-w-md">
          <CircularProgress
            value={userStatsArray.length - (userStatsArray.findIndex(u => u.brutto === chatterBrutto))}
            max={userStatsArray.length || 1}
            label={`#${userStatsArray.findIndex(u => u.brutto === chatterBrutto) + 1}`}
            sublabel={`von ${userStatsArray.length}`}
          />
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Agentur Ranglisten-Platz</div>
            <div className="text-xl font-black text-[#C9A86A] mt-1">🏆 Live-Position</div>
          </div>
        </div>
      </div>

      {/* Rangliste Mitarbeiter */}
      <section className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 hover:border-[#C9A86A]/30 transition-colors duration-300 mb-8">
        <h2 className="text-sm font-bold mb-4 text-[#C9A86A] uppercase tracking-wider">Mitarbeiter-Rangliste heute</h2>
        {userStatsArray.length > 0 && (
          <div className="mb-5 pb-5 border-b border-[#9C7A3D]/10">
            <MiniBarChart items={userStatsArray.map((u: any) => ({ label: u.name, value: u.netto }))} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#9C7A3D]/10 bg-[#050505] text-[#C9A86A] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3 w-12">Rang</th>
                <th className="p-3">Mitarbeiter</th>
                <th className="p-3">Arbeitszeit</th>
                <th className="p-3 text-gold-200">Umsatz Brutto</th>
                <th className="p-3 text-emerald-400">Umsatz Netto</th>
                <th className="p-3 text-slate-400">Ø Netto / h</th>
              </tr>
            </thead>
            <tbody>
              {userStatsArray.map((user, idx) => {
                const usdPerHr = user.hours > 0 ? user.netto / user.hours : 0;
                return (
                  <tr key={idx} className="border-b border-[#9C7A3D]/5 hover:bg-black/20 transition">
                    <td className="p-3 font-mono font-black text-[#C9A86A]">#{idx + 1}</td>
                    <td className="p-3 font-semibold text-white tracking-wide">{user.name}</td>
                    <td className="p-3 font-mono text-slate-400">{user.hours.toFixed(2)} h</td>
                    <td className="p-3 font-mono text-gold-200/80">${user.brutto.toFixed(2)}</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">${user.netto.toFixed(2)}</td>
                    <td className="p-3 font-mono text-slate-300">${usdPerHr.toFixed(2)}/h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 👑 NEUE MODEL RANGLISTE (Vollautomatisch basierend auf der Herkunft der Einnahmen!) - Task #72: nur Admin/Content-Manager */}
      {isAdminTier && (
        <section className="bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20 hover:border-[#C9A86A]/30 transition-colors duration-300 mb-8">
          <h2 className="text-sm font-bold mb-4 text-[#9C7A3D] uppercase tracking-wider">Model-Umsatz-Performance heute</h2>
          {modelStatsArray.length > 0 && (
            <div className="mb-5 pb-5 border-b border-[#9C7A3D]/10">
              <MiniBarChart items={modelStatsArray.map((m: any) => ({ label: m.name, value: m.netto }))} />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#9C7A3D]/10 bg-[#050505] text-[#9C7A3D] font-semibold text-xs uppercase tracking-wider">
                  <th className="p-3 w-12">Platz</th>
                  <th className="p-3">Model Name</th>
                  <th className="p-3 text-gold-200">Generiert Brutto</th>
                  <th className="p-3 text-emerald-400">Netto Account-Eingang</th>
                </tr>
              </thead>
              <tbody>
                {modelStatsArray.map((model, idx) => (
                  <tr key={idx} className="border-b border-[#9C7A3D]/5 hover:bg-black/20 transition">
                    <td className="p-3 font-mono font-black text-[#C9A86A]">#{idx + 1}</td>
                    <td className="p-3 font-semibold text-white tracking-wide">✨ {model.name}</td>
                    <td className="p-3 font-mono text-gold-200/80">${model.brutto.toFixed(2)}</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">${model.netto.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ⚠️ UNVOLLSTÄNDIGE BEWERBUNGEN (ABBRÜCHE) */}
      {abandonedLeads.length > 0 && (
        <section className="bg-black/40 p-6 rounded-2xl border border-gold-600/30 shadow-lg">
          <h2 className="text-sm font-bold mb-4 text-gold-500 uppercase tracking-wider"><span>⚠️</span> <span>Unvollständige Bewerbungen (Abbrüche) ({abandonedLeads.length})</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gold-600/20 bg-[#050505] text-gold-500 font-semibold text-xs uppercase tracking-wider">
                  <th className="p-3">Name</th>
                  <th className="p-3">Handynummer</th>
                  <th className="p-3">Abgebrochen am</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {abandonedLeads.map((lead, idx) => {
                  const abandonedDate = new Date(lead.abandoned_at);
                  const formattedDate = abandonedDate.toLocaleDateString("de-DE", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  });
                  return (
                    <tr key={lead.id} className="border-b border-gold-600/10 hover:bg-gold-950/10 transition">
                      <td className="p-3 font-semibold text-white tracking-wide">{lead.name || "Unbekannt"}</td>
                      <td className="p-3 font-mono text-slate-300">{lead.phone || "—"}</td>
                      <td className="p-3 text-slate-400 text-xs">{formattedDate}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 bg-gold-900/30 text-gold-400 px-3 py-1 rounded-full text-xs font-semibold border border-gold-600/20">
                          📝 Beim Tippen abgebrochen
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
