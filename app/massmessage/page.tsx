import { getCurrentUser } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import MassMessageListClient from "@/components/layout/MassMessageListClient";

export const dynamic = "force-dynamic";

type ArchivNachricht = {
  id: number;
  model_name: string;
  message_text: string;
  datum: string;
  rawDate: Date;
};

export default async function MassMessagesPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) { redirect("/login"); }

  const { data: shifts } = await supabase.from("shifts").select("id, shift_date, notes").order("shift_date", { ascending: false });

  const aktuelleWocheNachrichten: ArchivNachricht[] = [];
  const archivierteMonate: Record<string, ArchivNachricht[]> = {};

  // Berechne den Start der aktuellen Woche (Montag vor 7 Tagen)
  const jetzt = new Date();
  const tagImMonat = jetzt.getDate();
  const wochentag = jetzt.getDay();
  const diffToMonday = (wochentag === 0 ? 6 : wochentag - 1);
  const startDerWoche = new Date(jetzt);
  startDerWoche.setDate(tagImMonat - diffToMonday);
  startDerWoche.setHours(0, 0, 0, 0);

  (shifts || []).forEach((s) => {
    try {
      if (s.notes && s.notes.startsWith("{")) {
        const parsed = JSON.parse(s.notes);
        if (parsed.nachricht && parsed.nachricht.trim() !== "") {
          const shiftDate = s.shift_date ? new Date(s.shift_date) : new Date();
          const datumsString = shiftDate.toLocaleDateString("de-DE", { weekday: 'long', day: '2-digit', month: '2-digit' });

          const item: ArchivNachricht = {
            id: s.id,
            model_name: parsed.model || "Kein Model",
            message_text: parsed.nachricht,
            datum: datumsString,
            rawDate: shiftDate
          };

          // Wenn die Nachricht in der aktuellen Woche liegt
          if (shiftDate >= startDerWoche) {
            aktuelleWocheNachrichten.push(item);
          } else {
            // Ansonsten nach Monaten staffeln
            const monatKey = shiftDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
            if (!archivierteMonate[monatKey]) archivierteMonate[monatKey] = [];
            archivierteMonate[monatKey].push(item);
          }
        }
      }
    } catch (e) {}
  });

  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-[#0A0A0A] text-[#E2C48A] rounded-xl my-6 border border-[#9C7A3D]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#9C7A3D]/20 pb-4">
        <h1 className="text-2xl font-black tracking-wide bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent uppercase">MASS MESSAGES VERWALTUNG</h1>
        <p className="text-xs text-slate-400 mt-1">Hier werden alle genutzten Nachrichten intelligent gestaffelt und archiviert.</p>
      </div>

      <MassMessageListClient 
        aktuelleWoche={aktuelleWocheNachrichten} 
        archivierteMonate={archivierteMonate} 
      />
    </main>
  );
}
