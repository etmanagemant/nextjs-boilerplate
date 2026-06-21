import { getCurrentRole } from "@/lib/authz";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation"; // 🟢 Neu importieren!

export default async function ManagementPage() {
  const role = await getCurrentRole();

  // 1. Sicherheits-Check (Nutzt jetzt stabiles Next.js redirect)
  if (!role || role !== "admin") {
    redirect("/"); 
  }

  // Live-Daten aus Supabase abrufen
  const supabase = await createClient();
  
  const { data: mitarbeiterListe } = await supabase
    .from("mitarbeiter")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: modelsListe } = await supabase
    .from("models")
    .select("*")
    .order("name", { ascending: true });

  // ... ab hier bleiben die Server Actions (addMitarbeiter, etc.) und das gesamte return (...) EXAKT GLEICH!


  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800">Management Dashboard</h1>

      {/* BEREICH 1: MITARBEITER FREISCHALTEN */}
      <section className="bg-white p-6 rounded-lg border mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">Mitarbeiter freischalten & benennen</h2>
        
        {/* Formular zum Hinzufügen */}
        <form action={addMitarbeiter} className="flex gap-3 mb-6 flex-wrap">
          <input 
            type="email" 
            name="email" 
            placeholder="Registrierte E-Mail-Adresse" 
            required 
            className="flex-1 min-w-[200px] px-3 py-2 border rounded-md text-sm"
          />
          <input 
            type="text" 
            name="name" 
            placeholder="Mitarbeiter Name" 
            required 
            className="flex-1 min-w-[200px] px-3 py-2 border rounded-md text-sm"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition">
            Freischalten
          </button>
        </form>

        {/* Liste der Mitarbeiter */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500">
                <th className="p-2">Name</th>
                <th className="p-2">E-Mail</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {mitarbeiterListe.map((m) => (
                <tr key={m.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-medium text-slate-900">{m.name}</td>
                  <td className="p-2 text-slate-600">{m.email}</td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Aktiv ({m.rolle})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* BEREICH 2: MODELS VERWALTEN */}
      <section className="bg-white p-6 rounded-lg border mb-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">Models (Schichtplanung)</h2>
        
        {/* Formular zum Hinzufügen */}
        <form action={addModel} className="flex gap-3 mb-6">
          <input 
            type="text" 
            name="name" 
            placeholder="Model Name" 
            required 
            className="flex-1 px-3 py-2 border rounded-md text-sm"
          />
          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 transition">
            Model hinzufügen
          </button>
        </form>

        {/* Liste der Models mit Löschfunktion */}
        <div className="grid gap-3 sm:grid-cols-2">
          {modelsListe.map((model) => (
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

      {/* DEIN BESTEHENDER STATUS-BEREICH */}
      <section className="bg-white p-6 rounded-lg border shadow-sm">
        <h2 className="text-xl font-semibold mb-4 text-slate-700">Schicht-Status / Tasks</h2>
        <div className="flex gap-2 flex-wrap">
          <button className="px-4 py-2 border rounded-md bg-slate-100 text-slate-700 font-medium">Offen</button>
          <button className="px-4 py-2 border rounded-md text-slate-600 hover:bg-slate-50">In Arbeit</button>
          <button className="px-4 py-2 border rounded-md text-slate-600 hover:bg-slate-50">Geplant</button>
        </div>
      </section>
    </main>
  );
}
