import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { saveMassMessage } from "./actions";
import MassMessageListClient from "@/components/layout/MassMessageListClient";

export const dynamic = "force-dynamic";

export default async function MassMessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }

  // Lädt die echten Models für das Dropdown
  const { data: models } = await supabase.from("models").select("name").order("name", { ascending: true });
  
  // Lädt die permanent gespeicherten Archiv-Nachrichten
  const { data: savedMessages } = await supabase.from("saved_mass_messages").select("*").order("created_at", { ascending: false });

  const sichereModels = models || [];
  const sichereMessages = savedMessages || [];
  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black tracking-wide bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent">MASS MESSAGES VERWALTUNG</h1>
        <p className="text-xs text-slate-400 mt-1">Erstelle Vorlagen, die deine Chatter direkt aus der Stechuhr kopieren können.</p>
      </div>

      {/* Neue Nachricht hinzufügen */}
      <section className="bg-black/40 border border-[#AA7C11]/10 p-4 rounded-xl mb-8">
        <h2 className="text-sm font-bold text-[#D4AF37] mb-3 uppercase tracking-wider">Neue Vorlage abspeichern</h2>
        <form action={saveMassMessage} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Model</label>
              <select name="model_name" required className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded-md p-2 text-xs text-white focus:border-[#D4AF37] outline-none cursor-pointer">
                <option value="">-- Wählen --</option>
                {sichereModels.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Mass Message Text</label>
              <input type="text" name="message_text" placeholder="Hier den Text für die Werbe-Nachricht eintragen..." required className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded-md p-2 text-xs text-white focus:border-[#D4AF37] outline-none" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black px-4 py-1.5 rounded-md text-xs font-bold shadow-md hover:from-[#E5C158] transition cursor-pointer">Vorlage sichern</button>
          </div>
        </form>
      </section>

      {/* Die Liste mit Editier- und Löschfunktion */}
      <section>
        <h2 className="text-sm font-bold text-[#D4AF37] mb-4 uppercase tracking-wider">Gespeicherte Nachrichtenvorlagen ({sichereMessages.length})</h2>
        <MassMessageListClient nachrichten={sichereMessages} />
      </section>
    </main>
  );
}
