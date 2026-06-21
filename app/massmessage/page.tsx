import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type ArchivNachricht = {
  id: number;
  model: string;
  mitarbeiter: string;
  nachricht: string;
  datum: string;
  monatKey: string;
};

function MassMessageListClient({ nachrichten }: { nachrichten: ArchivNachricht[] }) {
  return (
    <div className="space-y-4">
      {nachrichten.map((nachricht) => (
        <article key={nachricht.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-amber-400">{nachricht.model}</span>
              <span className="text-xs text-slate-500">{nachricht.datum}</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">{nachricht.mitarbeiter}</p>
              <p className="text-sm leading-6 text-slate-300">{nachricht.nachricht}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function MassMessagesArchivPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }

  const { data: shifts } = await supabase
    .from("shifts")
    .select("id, shift_date, notes")
    .order("shift_date", { ascending: false });

  const extrahierteNachrichten: ArchivNachricht[] = [];

  (shifts || []).forEach((s) => {
    try {
      if (s.notes && s.notes.startsWith("{")) {
        const parsed = JSON.parse(s.notes);
        if (parsed.nachricht && parsed.nachricht.trim() !== "") {
          const dateObj = new Date(s.shift_date || Date.now());
          const monatKey = dateObj.toLocaleDateString("de-DE", {
            month: "long",
            year: "numeric"
          });

          extrahierteNachrichten.push({
            id: s.id,
            model: parsed.model || "Unbekannt",
            mitarbeiter: parsed.mitarbeiter || "Unbekannt",
            nachricht: parsed.nachricht,
            datum: s.shift_date ? new Date(s.shift_date).toLocaleDateString("de-DE") : "—",
            monatKey: monatKey
          });
        }
      }
    } catch (e) {}
  });

  const gruppiertNachMonat: Record<string, ArchivNachricht[]> = {};
  extrahierteNachrichten.forEach((n) => {
    if (!gruppiertNachMonat[n.monatKey]) {
      gruppiertNachMonat[n.monatKey] = [];
    }
    gruppiertNachMonat[n.monatKey].push(n);
  });
  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-slate-900 text-white rounded-lg my-6 border border-slate-800">
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4 flex-wrap gap-4 bg-slate-950 p-4 rounded-xl">
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-amber-400 tracking-wide">Mass Message Archiv</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Alte Werbenachrichten einsehen, filtern und reaktivieren</p>
        </div>
      </div>

      {Object.keys(gruppiertNachMonat).length === 0 ? (
        <div className="text-center text-slate-500 italic py-12 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
          Bisher wurden keine Mass Messages im Kalender verwendet.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(gruppiertNachMonat).map(([monat, nachrichten]) => (
            <div key={monat} className="space-y-4">
              <h2 className="text-xs font-extrabold text-amber-400 border-b border-slate-800 pb-1 tracking-wide uppercase">
                🗓️ {monat}
              </h2>
              <MassMessageListClient nachrichten={nachrichten} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
