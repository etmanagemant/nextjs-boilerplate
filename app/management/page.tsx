import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { updateMitarbeiterRolle, updateMitarbeiterName, addModel, deleteModel } from "./actions";
// 🟢 IMPORTE EXAKT BEIBEHALTEN
import CreateShiftForm from "@/components/layout/CreateShiftForm"; 
import RoleSelect from "@/components/layout/RoleSelect"; 

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }
  
  let isAdmin = false;
  if (user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com") {
    isAdmin = true;
  } else {
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (profile && profile.role === "admin") isAdmin = true;
  }

  if (!isAdmin) { redirect("/"); }

  const { data: profilListe } = await supabase.from("profiles").select("user_id, role, email, full_name");
  const { data: modelsListe } = await supabase.from("models").select("id, name").order("name", { ascending: true });
  const { data: alleSchichten } = await supabase.from("shift_assignments").select("*");

  const sichereProfile = profilListe || [];
  const sichereModels = modelsListe || [];
  const sichereSchichten = alleSchichten || [];

  let gesamtStundenAllerUser = 0;
  sichereSchichten.forEach((s) => {
    if (s.started_at && s.ended_at) {
      const start = new Date(s.started_at).getTime();
      const end = new Date(s.ended_at).getTime();
      if (end > start) {
        gesamtStundenAllerUser += (end - start) / (1000 * 60 * 60);
      }
    }
  });
  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="flex justify-between items-center mb-6 border-b border-[#AA7C11]/20 pb-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">Management Control</h1>
          <p className="text-xs text-slate-400 mt-1">Zentrale Verwaltung der Agentur-Mitarbeiter und Models</p>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg hover:bg-red-500/20 transition cursor-pointer font-bold">Abmelden</button>
        </form>
      </div>

      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 mb-8 text-center shadow-lg">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Abgeleistete Gesamtstunden (Stechuhr)</div>
        <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-[#D4AF37] mt-2 font-mono tracking-wide">{gesamtStundenAllerUser.toFixed(2)} h</div>
      </section>

      {/* SCHICHTERSTELLUNG FORMULAR */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 mb-8 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">Neue Schicht zuteilen & planen</h2>
        <CreateShiftForm sichereProfile={sichereProfile} sichereModels={sichereModels} />
      </section>

      {/* MITARBEITER-VERWALTUNG */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 mb-8 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">Mitarbeiter & Rollen modifizieren</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#AA7C11]/10 bg-[#050505] text-[#D4AF37] font-semibold text-xs uppercase tracking-wider">
                <th className="p-3">Name</th>
                <th className="p-3">E-Mail</th>
                <th className="p-3 w-[150px]">Rolle ändern</th>
              </tr>
            </thead>
            <tbody>
              {sichereProfile.map((p) => (
                <tr key={p.user_id} className="border-b border-[#AA7C11]/5 hover:bg-black/20 transition">
                  <td className="p-3">
                    <form action={updateMitarbeiterName} className="flex gap-2">
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <input type="text" name="full_name" defaultValue={p.full_name || ""} required className="bg-[#050505] border border-[#AA7C11]/30 rounded px-2 py-1 text-sm text-white focus:border-[#D4AF37] outline-none w-full max-w-[160px]" />
                      <button type="submit" className="text-[11px] bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black px-2 py-1 rounded font-bold hover:from-[#E5C158] transition cursor-pointer">Speichern</button>
                    </form>
                  </td>
                  <td className="p-3 text-slate-400 font-mono text-xs">{p.email || "keine E-Mail"}</td>
                  <td className="p-3">
                    <RoleSelect 
                      userId={p.user_id} 
                      defaultRole={p.role} 
                      onUpdateAction={updateMitarbeiterRolle} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {/* MODELS VERWALTEN */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">Models (Schichtplanung)</h2>
        <form action={addModel} className="flex gap-3 mb-6">
          <input type="text" name="name" placeholder="Model Name" required className="flex-1 px-3 py-2 border border-[#AA7C11]/30 rounded-md text-sm text-white bg-[#050505] focus:border-[#D4AF37] outline-none" />
          <button type="submit" className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black px-4 py-2 rounded-md text-sm font-bold hover:from-[#E5C158] transition cursor-pointer">Model hinzufügen</button>
        </form>
        <div className="grid gap-3 sm:grid-cols-2">
          {sichereModels.map((model) => (
            <div key={model.id} className="flex justify-between items-center p-3 border border-[#AA7C11]/20 rounded-md bg-[#050505]/40 hover:border-[#D4AF37]/50 transition">
              <span className="font-semibold text-white tracking-wide">{model.name}</span>
              <form action={deleteModel}>
                <input type="hidden" name="id" value={model.id} />
                <button type="submit" className="text-red-400 hover:text-red-300 text-sm font-bold transition cursor-pointer">Löschen</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
