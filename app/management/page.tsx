// app/management/page.tsx
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }
  
  // 🟢 DEIN E-MAIL-HARDCODE (Aus den vorherigen Schritten exakt beibehalten)
  let isAdmin = false;
  if (user.email === "etmanagemant@gmail.com") {
    isAdmin = true;
  }

  if (!isAdmin) { redirect("/"); }

  // Daten-Arrays sicher vordefinieren
  let profilListe: any[] = [];
  let modelsListe: any[] = [];

  // Extrem sichere Daten-Abfrage ohne single() Absturzrisiko
  const { data: pData } = await supabase.from("profiles").select("user_id, role, email, full_name");
  if (pData) profilListe = pData;

  const { data: mData } = await supabase.from("models").select("id, name");
  if (mData) modelsListe = mData;

  // Server Actions
  async function updateMitarbeiterRolle(formData: FormData) {
    "use server";
    const targetUserId = formData.get("user_id");
    const neueRolle = formData.get("rolle") as string;
    if (targetUserId && neueRolle) {
      const supabaseServer = await createClient();
      await supabaseServer.from("profiles").update({ role: neueRolle }).eq("user_id", targetUserId);
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

      {/* MITARBEITER-VERWALTUNG */}
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
                      <select name="rolle" defaultValue={p.role} onChange={(e) => e.target.form?.requestSubmit()} className="w-full px-2 py-1 rounded border text-xs font-semibold bg-slate-900 text-white border-slate-700">
                        <option value="chatter">Chatter</option>
                        <option value="admin">Admin</option>
                      </select>
                    </form>
                  </td>
                </tr>
              ))}
              {profilListe.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-500">Keine Profile gefunden.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODELS VERWALTEN */}
      <section className="bg-slate-950 p-6 rounded-lg border border-slate-800 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Models (Schichtplanung)</h2>
        <form action={addModel} className="flex gap-3 mb-6">
          <input type="text" name="name" placeholder="Model Name" required className="flex-1 px-3 py-2 border border-slate-700 rounded-md text-sm text-white bg-slate-900" />
          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700">Model hinzufügen</button>
        </form>
        <div className="grid gap-3 sm:grid-cols-2">
          {modelsListe.map((model) => (
            <div key={model.id} className="flex justify-between items-center p-3 border border-slate-800 rounded-md bg-slate-900">
              <span className="font-medium text-slate-200">{model.name}</span>
              <form action={deleteModel}>
                <input type="hidden" name="id" value={model.id} />
                <button type="submit" className="text-red-400 hover:text-red-500 text-sm font-semibold">Löschen</button>
              </form>
            </div>
          ))}
          {modelsListe.length === 0 && (
            <div className="col-span-2 text-sm text-slate-500 text-center py-4">Keine Models hinterlegt.</div>
          )}
        </div>
      </section>
    </main>
  );
}
