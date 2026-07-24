import { createClient } from "@/utils/supabase/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import { addModel, deleteModel, updateModelName, updateModelAvatar } from "./actions";
import { revalidatePath } from "next/cache";
// 🟢 IMPORTE EXAKT BEIBEHALTEN
import CreateShiftForm from "@/components/layout/CreateShiftForm";
import ModelsManagementClient from "@/components/layout/ModelsManagementClient";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) { redirect("/login"); }

  let isAdmin = false;
  if (user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com") {
    isAdmin = true;
  } else {
    const profile = await getCurrentProfile(user.id);
    if (profile && profile.role === "admin") isAdmin = true;
  }

  if (!isAdmin) { redirect("/"); }

  // 🛡️ ERWEITERTES SELECT: Zieht provision_rate + hourly_rate mit aus der Datenbank heraus!
  const [{ data: profilListe }, { data: modelsListe }, { data: alleSchichten }] = await Promise.all([
    supabase.from("profiles").select("user_id, role, email, full_name, provision_rate, hourly_rate"),
    supabase.from("models").select("id, name, platform_type, avatar_url").order("name", { ascending: true }),
    supabase.from("shift_assignments").select("*"),
  ]);

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

  // ⚡ SERVER ACTION: Neue krisensichere Funktion speichert die Provision ab, ohne Code-Konflikte!
  async function updateMitarbeiterProvision(formData: FormData) {
    "use server";
    const uId = formData.get("user_id") as string;
    const rate = Number(formData.get("provision_rate") || 20);
    
    const serverSupabase = await createClient();
    await serverSupabase
      .from("profiles")
      .update({ provision_rate: rate })
      .eq("user_id", uId);
      
    revalidatePath("/management");
  }
  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-[#0A0A0A] text-[#E2C48A] rounded-xl my-6 border border-[#9C7A3D]/20 shadow-2xl">
      <div className="flex justify-between items-center mb-6 border-b border-[#9C7A3D]/20 pb-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent uppercase tracking-wider">Management Control</h1>
          <p className="text-xs text-slate-400 mt-1">Zentrale Verwaltung der Agentur-Mitarbeiter und Models</p>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg hover:bg-red-500/20 transition cursor-pointer font-bold">Abmelden</button>
        </form>
      </div>

      <section className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/10 mb-8 text-center shadow-lg">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Abgeleistete Gesamtstunden (Stechuhr)</div>
        <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-[#C9A86A] mt-2 font-mono tracking-wide">{gesamtStundenAllerUser.toFixed(2)} h</div>
      </section>

      {/* SCHICHTERSTELLUNG FORMULAR */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/10 mb-8 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#C9A86A] uppercase tracking-wider">Neue Schicht zuteilen & planen</h2>
        <CreateShiftForm sichereProfile={sichereProfile} sichereModels={sichereModels} />
      </section>

      {/* Mitarbeiter & Rollen modifizieren moved to Connection Hub
          (/management/crm-connect), alongside the model connections it
          affects. */}
      {/* MODELS VERWALTEN */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#9C7A3D]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#C9A86A] uppercase tracking-wider">Models (Schichtplanung)</h2>
        <form action={addModel} className="flex gap-3 mb-6">
          <input type="text" name="name" placeholder="Model Name" required className="flex-1 px-3 py-2 border border-[#9C7A3D]/30 rounded-md text-sm text-white bg-[#050505] focus:border-[#C9A86A] outline-none" />
          <button type="submit" className="bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black px-4 py-2 rounded-md text-sm font-bold hover:from-[#E5C158] transition cursor-pointer">Model hinzufügen</button>
        </form>
        
        <ModelsManagementClient
          models={sichereModels}
          onDeleteClick={deleteModel}
          onNameChange={updateModelName}
          onAvatarChange={updateModelAvatar}
        />
      </section>
    </main>
  );
}
