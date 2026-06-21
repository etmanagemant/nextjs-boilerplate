import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import MassMessageListClient from "@/components/layout/MassMessageListClient";

export const dynamic = "force-dynamic";

type ArchivNachricht = {
  id: number;
  model_name: string;
  message_text: string;
  datum: string;
};

export default async function MassMessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }

  // Holt alle Schichten aus dem Kalender
  const { data: shifts } = await supabase
    .from("shifts")
    .select("id, shift_date, notes")
    .order("shift_date", { ascending: false });

  const extrahierteNachrichten: ArchivNachricht[] = [];

  (shifts || []).forEach((s) => {
    try {
      if (s.notes && s.notes.startsWith("{")) {
        const parsed = JSON.parse(s.notes);
        // Automatische Erkennung: Nur Einträge mit einer genutzten Nachricht laden
        if (parsed.nachricht && parsed.nachricht.trim() !== "") {
          extrahierteNachrichten.push({
            id: s.id,
            model_name: parsed.model || "Kein Model",
            message_text: parsed.nachricht,
            datum: s.shift_date ? new Date(s.shift_date).toLocaleDateString("de-DE") : "—"
          });
        }
      }
    } catch (e) {}
  });

  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black tracking-wide bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase">MASS MESSAGES VERWALTUNG</h1>
        <p className="text-xs text-slate-400 mt-1">Hier werden alle im Kalender genutzten Werbenachrichten automatisch gesammelt.</p>
      </div>

      <section>
        <h2 className="text-sm font-bold text-[#D4AF37] mb-4 uppercase tracking-wider">Bisher genutzte Nachrichten ({extrahierteNachrichten.length})</h2>
        <MassMessageListClient nachrichten={extrahierteNachrichten} />
      </section>
    </main>
  );
}
