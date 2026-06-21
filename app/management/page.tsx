// app/management/page.tsx
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { updateMitarbeiterRolle, addModel, deleteModel } from "./actions";
import CreateShiftForm from "@/components/layout/CreateShiftForm";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }
  
  // Deine funktionierende Admin-Erkennung bleibt exakt gleich
  let isAdmin = false;
  if (user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com") {
    isAdmin = true;
  } else {
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (profile && profile.role === "admin") isAdmin = true;
  }

  if (!isAdmin) { redirect("/"); }

  // Daten live aus deinen echten Spalten laden
  const { data: profilListe } = await supabase.from("profiles").select("user_id, role, email, full_name");
  const { data: modelsListe } = await supabase.from("models").select("id, name").order("name", { ascending: true });
  const { data: alleSchichten } = await supabase.from("shift_assignments").select("*");

  const sichereProfile = profilListe || [];
  const sichereModels = modelsListe || [];
  const sichereSchichten = alleSchichten || [];

  // Stunden-Statistik
  let gesamtStundenAllerUser = 0;
  sichereSchichten.forEach((s) => {
    if (s.started_at && s.ended_at && !s.time_slot) {
      const start = new Date(s.started_at).getTime();
      const end = new Date(s.ended_at).getTime();
      if (end > start) {
        gesamtStundenAllerUser += (end - start) / (1000 * 60 * 60);
      }
    }
  });

  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-slate-900 text-white rounded-lg my-6 border border-slate-800">
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4 flex-wrap gap-4">
        <div className="flex items-center gap-6">
          <h1 className="text-3xl font-bold text-white">Management</h1>
          <nav className="flex gap-3 text-sm">
            <a href="/" className="text-slate-400 hover:text-white px-3 py-1.5 rounded bg-slate-800 font-medium transition">Startseite (Kalender)</a>
            <a href="/chatter" className="text-slate-400 hover:text-white px-3 py-1.5 rounded bg-slate-800 font-medium transition">Chatter-Ansicht</a>
          </nav>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition cursor-pointer font-medium">Abmelden</button>
        </form>
      </div>

      <section className="bg-slate-950 p-6 rounded-lg border border-slate-800 mb-8 shadow-sm">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Abgeleistete Gesamtstunden (Stechuhr)</div>
        <div className="text-3xl font-bold text-emerald-400 mt-2 text-center">{gesamtStundenAllerUser.toFixed(2)} h</div>
      </section>

      {/* SCHICHTERSTELLUNG FORMULAR */}
      <section className="bg-slate-950 p-6 rounded-lg border border-slate-800 mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Neue Schicht zuteilen & planen</h2>
        <CreateShiftForm sichereProfile={sichereProfile} sichereModels={sichereModels} />
      </section>

      {/* MITARBEITER-VERWALTUNG */}
      <section className="bg-slate-950 p-6 rounded-lg border border-slate-800 mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Mitarbeiter & Rollen modifizieren</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-slate-400">
                <th className="p-3">Name</th>
                <th className="p-3">E-Mail</th>
                <th className="p-3 w-[220px]">Rolle ändern</th>
              </tr>
            </thead>
            <tbody>
              {sichereProfile.map((p) => (
                <tr key={p.user_id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                  <td className="p-3 font-medium text-slate-100">{p.full_name || "Mitarbeiter"}</td>
                  <td className="p-3 text-slate-400">{p.email || "keine E-Mail"}</td>
                  <td className="p-3">
                    {/* 🟢 JETZT FEHLERFREI: Ein ganz normales HTML-Formular mit einem Speichern-Button */}
                    <form action={updateMitarbeiterRolle} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <select 
                        name="rolle" 
                        defaultValue={p.role || "chatter"} 
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                      >
                        <option value="chatter">Chatter</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button 
                        type="submit" 
                        className="text-xs bg-slate-700 text-slate-200 px-3 py-1.5 rounded hover:bg-slate-600 transition cursor-pointer font-medium"
                      >
                        Speichern
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODELS VERWALTEN */}
      <section className="bg-slate-950 p-6 rounded-lg border border-slate-800 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Models (Schichtplanung)</h2>
        <form action={addModel} className="flex gap-3 mb-6">
          <input type="text" name="name" placeholder="Model Name" required className="flex-1 px-3 py-2 border border-slate-700 rounded-md text-sm text-white bg-slate-900 focus:outline-none focus:border-blue-500" />
          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 transition cursor-pointer">Model hinzufügen</button>
        </form>
        <div className="grid gap-3 sm:grid-cols-2">
          {sichereModels.map((model) => (
            <div key={model.id} className="flex justify-between items-center p-3 border border-slate-800 rounded-md bg-slate-900">
              <span className="font-medium text-slate-200">{model.name}</span>
              <form action={deleteModel}>
                <input type="hidden" name="id" value={model.id} />
                <button type="submit" className="text-red-400 hover:text-red-500 text-sm font-semibold transition cursor-pointer">Löschen</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
