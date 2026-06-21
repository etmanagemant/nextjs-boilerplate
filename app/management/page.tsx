import { getCurrentRole } from "@/lib/authz";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function ManagementPage() {
  const role = await getCurrentRole();

  // Sicherheits-Check
  if (!role || role !== "admin") {
    redirect("/");
  }

  let profilListe: any[] = [];
  let modelsListe: any[] = [];

  // Der absolute Absturz-Schutz: Fängt jeden Datenbankfehler ab
  try {
    const supabase = await createClient();
    
    const { data: pData } = await supabase.from("profiles").select("*");
    if (pData) profilListe = pData;

    const { data: mData } = await supabase.from("models").select("*").order("name", { ascending: true });
    if (mData) modelsListe = mData;
  } catch (e) {
    console.error("Kritischer Datenbank-Ladefehler:", e);
  }

  async function updateMitarbeiterRolle(formData: FormData) {
    "use server";
    const targetUserId = formData.get("user_id");
    const neueRolle = formData.get("rolle") as string;
    
    if (targetUserId && neueRolle) {
      try {
        const supabaseServer = await createClient();
        await supabaseServer
          .from("profiles")
          .update({ role: neueRolle })
          .eq("user_id", targetUserId);
        revalidatePath("/management");
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function addModel(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    if (name) {
      try {
        const supabaseServer = await createClient();
        await supabaseServer.from("models").insert([{ name }]);
        revalidatePath("/management");
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function deleteModel(formData: FormData) {
    "use server";
    const id = formData.get("id");
    if (id) {
      try {
        const supabaseServer = await createClient();
        await supabaseServer.from("models").delete().eq("id", id);
        revalidatePath("/management");
      } catch (err) {
        console.error(err);
      }
    }
  }

  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-slate-900 text-white rounded-lg my-6 border border-slate-800">
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-bold text-white">Management Dashboard</h1>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition">
            Abmelden
          </button>
        </form>
      </div>

      {/* BEREICH 1: MITARBEITER-VERWALTUNG */}
      <section className="bg-slate-950 p-6 rounded-lg border border-slate-800 mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Mitarbeiter & Rollen modifizieren</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900 text-slate-400">
                <th className="p-3">Name</th>
                <th className="p-3">E-Mail</th>
                <th className="p-3 w-[150px]">Rolle ändern</th>
              </tr>
            </thead>
            <tbody>
              {profilListe.map((p) => (
                <tr key={p.user_id} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                  <td className="p-3 font-medium text-slate-100">{p.full_name || "Mitarbeiter"}</td>
                  <td className="p-3 text-slate-400">{p.email || "keine E-Mail"}</td>
                  <td className="p-3">
                    <form action={updateMitarbeiterRolle} className="inline-block w-full">
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <select 
                        name="rolle" 
                        defaultValue={p.role}
                        onChange={(e) => e.target.form?.requestSubmit()}
                        className={`w-full px-2 py-1 rounded border text-xs font-semibold bg-slate-900 text-white ${
                          p.role === 'admin' ? 'border-red-500/50 text-red-400' : 'border-green-500/50 text-green-400'
                        }`}
                      >
                        <option value="chatter">Chatter</option>
                        <option value="admin">Admin</option>
                      </select>
                    </form>
                  </td>
                </tr>
              ))}
              {profilListe.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-500">Noch keine Profile registriert.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* BEREICH 2: MODELS VERWALTEN */}
      <section className="bg-slate-950 p-6 rounded-lg border border-slate-800 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Models (Schichtplanung)</h2>
        
        <form action={addModel} className="flex gap-3 mb-6">
          <input 
            type="text" 
            name="name" 
            placeholder="Model Name" 
            required 
            className="flex-1 px-3 py-2 border border-slate-700 rounded-md text-sm text-white bg-slate-900 focus:outline-none focus:border-blue-500"
          />
          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 transition">
            Model hinzufügen
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2">
          {modelsListe.map((model) => (
            <div key={model.id} className="flex justify-between items-center p-3 border border-slate-800 rounded-md bg-slate-900">
              <span className="font-medium text-slate-200">{model.name}</span>
              <form action={deleteModel}>
                <input type="hidden" name="id" value={model.id} />
                <button type="submit" className="text-red-400 hover:text-red-500 text-sm font-semibold transition">
                  Löschen
                </button>
              </form>
            </div>
          ))}
          {modelsListe.length === 0 && (
            <div className="col-span-2 text-sm text-slate-500 text-center py-2">Keine Models hinterlegt.</div>
          )}
        </div>
      </section>
    </main>
  );
}
