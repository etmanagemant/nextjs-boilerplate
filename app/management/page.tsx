import { getCurrentRole } from "@/lib/authz";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function ManagementPage() {
  const role = await getCurrentRole();

  if (!role || role !== "admin") {
    redirect("/");
  }

  const supabase = await createClient();
  
  // Holt alle registrierten Mitarbeiter aus deiner echten 'profiles' Tabelle
  const { data: profilListe } = await supabase
    .from("profiles")
    .select("*");

  // Holt die Models aus deiner echten 'models' Tabelle
  const { data: modelsListe } = await supabase
    .from("models")
    .select("*")
    .order("name", { ascending: true });

  // Server Action: Ändert die Rolle in der profiles-Tabelle live
  async function updateMitarbeiterRolle(formData: FormData) {
    "use server";
    const profileId = formData.get("id");
    const neueRolle = formData.get("rolle") as string;
    
    if (profileId && neueRolle) {
      const supabaseServer = await createClient();
      await supabaseServer
        .from("profiles")
        .update({ role: neueRolle })
        .eq("id", profileId);
      
      revalidatePath("/management");
    }
  }

  async function addModel(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    if (name) {
      const supabaseServer = await createClient();
      await supabaseServer.from("models").insert([{ name }]);
      revalidatePath("/management");
    }
  }

  async function deleteModel(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (id) {
      const supabaseServer = await createClient();
      await supabaseServer.from("models").delete().eq("id", id);
      revalidatePath("/management");
    }
  }

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800">Management Dashboard</h1>

      {/* BEREICH 1: MITARBEITER-VERWALTUNG */}
      <section className="bg-white p-6 rounded-lg border mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">Mitarbeiter & Rollen modifizieren</h2>
        <p className="text-xs text-slate-500 mb-4">Hier siehst du alle registrierten Profile aus deiner Datenbank.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500">
                <th className="p-2">Profil-ID / Name</th>
                <th className="p-2 w-[150px]">Rolle ändern</th>
              </tr>
            </thead>
            <tbody>
              {profilListe?.map((p) => (
                <tr key={p.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-medium text-slate-900">
                    {p.display_name || p.username || `User #${p.id}`}
                  </td>
                  <td className="p-2">
                    <form action={updateMitarbeiterRolle} className="inline-block w-full">
                      <input type="hidden" name="id" value={p.id} />
                      <select 
                        name="rolle" 
                        defaultValue={p.role}
                        onChange={(e) => e.target.form?.requestSubmit()}
                        className={`w-full px-2 py-1 rounded border text-xs font-semibold ${
                          p.role === 'admin' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'
                        }`}
                      >
                        <option value="chatter">Chatter</option>
                        <option value="admin">Admin</option>
                      </select>
                    </form>
                  </td>
                </tr>
              ))}
              {(!profilListe || profilListe.length === 0) && (
                <tr>
                  <td colSpan={2} className="p-4 text-center text-slate-500">Noch keine Profile registriert.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* BEREICH 2: MODELS VERWALTEN */}
      <section className="bg-white p-6 rounded-lg border mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">Models (Schichtplanung)</h2>
        
        <form action={addModel} className="flex gap-3 mb-6">
          <input 
            type="text" 
            name="name" 
            placeholder="Model Name" 
            required 
            className="flex-1 px-3 py-2 border rounded-md text-sm text-slate-900 bg-white"
          />
          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700">
            Model hinzufügen
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2">
          {modelsListe?.map((model) => (
            <div key={model.id} className="flex justify-between items-center p-3 border rounded-md bg-slate-50">
              <span className="font-medium text-slate-800">{model.name}</span>
              <form action={deleteModel}>
                <input type="hidden" name="id" value={model.id} />
                <button type="submit" className="text-red-500 hover:text-red-700 text-sm font-semibold">
                  Löschen
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
