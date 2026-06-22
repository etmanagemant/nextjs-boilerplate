import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { updateChatterBillingDetails } from "./actions";
// 🛡️ HIER IST WIEDER DEIN ECHTES FORMULAR IMPORTIERT!
import AbrechnungFormClient from "@/components/layout/AbrechnungFormClient";

export const dynamic = "force-dynamic";

export default async function AbrechnungPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }

  // Lade das Profil des eingeloggten Chatters
  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  
  // Lade seine abgeleisteten Schichten für die Übersicht
  const { data: shifts } = await supabase.from("shift_assignments").select("*").eq("chatter_id", user.id).order("started_at", { ascending: false });
  const { data: revenues } = await supabase.from("chatter_revenues").select("amount").eq("user_id", user.id);

  const sichereShifts = shifts || [];
  const sichereRevenues = revenues || [];

  // Berechne die Gesamt-Stundenleistung des aktuellen Monats
  let gesamtStunden = 0;
  sichereShifts.forEach(s => {
    if (s.started_at && s.ended_at) {
      gesamtStunden += (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / (1000 * 60 * 60);
    }
  });

  const gesamtUmsatz = sichereRevenues.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  return (
    <main className="p-6 max-w-4xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black tracking-wide bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase">DEINE ABRECHNUNGEN</h1>
        <p className="text-xs text-slate-400 mt-1">Hinterlege deine Daten optional. Rechnungen werden vollautomatisch generiert.</p>
      </div>

      {/* Leistungskacheln des Chatters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-black/40 border border-[#AA7C11]/10 p-4 rounded-xl text-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Geleistete Arbeitszeit</span>
          <span className="text-2xl font-mono font-black text-white mt-1 block">{gesamtStunden.toFixed(2)} h</span>
        </div>
        <div className="bg-black/40 border border-[#AA7C11]/10 p-4 rounded-xl text-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Erfasster Live-Umsatz</span>
          <span className="text-2xl font-mono font-black text-emerald-400 mt-1 block">${gesamtUmsatz.toFixed(2)}</span>
        </div>
      </div>

      {/* Interaktives Client-Formular für Krypto/Bank-Wechsel */}
      <section className="bg-black/40 border border-[#AA7C11]/10 p-6 rounded-xl mb-6">
        <h2 className="text-sm font-bold text-[#D4AF37] uppercase tracking-wider mb-4">Auszahlungsdaten verwalten (Optional)</h2>
        <AbrechnungFormClient profile={profile} actionTarget={updateChatterBillingDetails} />
      </section>

      {/* Rechnungs-Download-Sektion */}
      <section className="bg-black/40 border border-[#AA7C11]/10 p-6 rounded-xl">
        <h2 className="text-sm font-bold text-[#D4AF37] uppercase tracking-wider mb-3">Verfügbare PDF-Downloads</h2>
        <div className="flex justify-between items-center bg-[#050505] p-3 border border-[#AA7C11]/20 rounded-lg">
          <span className="text-xs font-semibold text-white uppercase tracking-wider">Abrechnung - Aktueller Monat</span>
          <button className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black px-3 py-1 text-xs font-bold rounded hover:from-[#E5C158] transition cursor-pointer">PDF Generieren</button>
        </div>
      </section>
    </main>
  );
}
