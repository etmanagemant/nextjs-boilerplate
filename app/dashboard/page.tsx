import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }

  // Daten parallel abrufen, um Abstürze zu verhindern
  const [profilesRes, modelsRes, shiftsRes, revenueRes] = await Promise.all([
    supabase.from("profiles").select("user_id, full_name, email"),
    supabase.from("models").select("id, name"),
    supabase.from("shift_assignments").select("chatter_id, started_at, ended_at"),
    supabase.from("chatter_revenues").select("user_id, model_id, amount")
  ]);

  const profiles = profilesRes.data || [];
  const models = modelsRes.data || [];
  const assignments = shiftsRes.data || [];
  const revenues = revenueRes.data || [];

  // 📈 Berechne die Gesamtstunden pro Mitarbeiter aus der Stechuhr
  const statsPerUser: Record<string, { name: string; email: string; hours: number; revenue: number }> = {};

  profiles.forEach(p => {
    statsPerUser[p.user_id] = {
      name: p.full_name || "Mitarbeiter",
      email: p.email || "",
      hours: 0,
      revenue: 0
    };
  });

  assignments.forEach(a => {
    if (a.chatter_id && a.started_at && statsPerUser[a.chatter_id]) {
      const start = new Date(a.started_at).getTime();
      const end = a.ended_at ? new Date(a.ended_at).getTime() : Date.now();
      if (end > start) {
        statsPerUser[a.chatter_id].hours += (end - start) / (1000 * 60 * 60);
      }
    }
  });

  // 💰 Addiere die Umsätze zu den jeweiligen Mitarbeitern
  revenues.forEach(r => {
    if (r.user_id && statsPerUser[r.user_id]) {
      statsPerUser[r.user_id].revenue += Number(r.amount || 0);
    }
  });

  const userStatsArray = Object.values(statsPerUser);
  const gesamtUmsatzAgentur = revenues.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-slate-950 text-white my-6 rounded-xl border border-slate-800 shadow-2xl">
      {/* Dashboard Header mit Navigation */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4 flex-wrap gap-4 bg-slate-900 p-4 rounded-xl">
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-wide">ET Dashboard</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Umsatzleistung & Stechuhr-Analysen</p>
        </div>
        <nav className="flex gap-2 text-sm bg-slate-950 p-1 rounded-lg border border-slate-800">
          <a href="/" className="text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-900 font-medium transition">Kalender</a>
          <a href="/management" className="text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-900 font-medium transition">Management</a>
          <a href="/chatter" className="text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-900 font-medium transition">Stechuhr</a>
        </nav>
      </div>

      {/* Globale Übersichtskarten */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800/60 shadow-lg text-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gesamtumsatz Agentur</div>
          <div className="text-4xl font-black text-emerald-400 mt-2 tracking-wide">${gesamtUmsatzAgentur.toFixed(2)}</div>
        </div>
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800/60 shadow-lg text-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Erfasste Profile</div>
          <div className="text-4xl font-black text-blue-400 mt-2 tracking-wide">{userStatsArray.length}</div>
        </div>
      </div>
      {/* Performance Tabelle */}
      <section className="bg-slate-900 p-6 rounded-xl border border-slate-800/60 shadow-lg">
        <h2 className="text-xl font-bold mb-4 text-slate-200 tracking-wide">Mitarbeiter Umsatzleistung</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold uppercase text-[11px] tracking-wider">
                <th className="p-3">Mitarbeiter</th>
                <th className="p-3">E-Mail</th>
                <th className="p-3">Arbeitszeit</th>
                <th className="p-3">Generierter Umsatz</th>
                <th className="p-3 text-emerald-400">Umsatz / Stunde</th>
              </tr>
            </thead>
            <tbody>
              {userStatsArray.map((user, idx) => {
                const usdPerHr = user.hours > 0 ? user.revenue / user.hours : 0;
                return (
                  <tr key={idx} className="border-b border-slate-800/40 hover:bg-slate-950/40 transition">
                    <td className="p-3 font-semibold text-slate-100">{user.name}</td>
                    <td className="p-3 text-slate-400 text-xs">{user.email}</td>
                    <td className="p-3 font-mono font-medium text-slate-300">{user.hours.toFixed(2)} h</td>
                    <td className="p-3 font-mono font-bold text-slate-200">${user.revenue.toFixed(2)}</td>
                    <td className="p-3 font-mono font-black text-emerald-400">${usdPerHr.toFixed(2)}/h</td>
                  </tr>
                );
              })}
              {userStatsArray.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500 italic py-6">Keine Leistungsdaten vorhanden.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
