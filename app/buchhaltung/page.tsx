import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { updateAgencySettings } from "@/app/abrechnung/actions";

export const dynamic = "force-dynamic";

export default async function BuchhaltungPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Harte Absicherung: Chatter fliegen sofort raus!
  if (!user) { redirect("/login"); }
  const { data: adminCheck } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (user.email !== "etmanagement@gmail.com" && adminCheck?.role !== "admin") { redirect("/"); }

  // Daten parallel laden
  const [agencyRes, profilesRes, shiftsRes, revenueRes] = await Promise.all([
    supabase.from("agency_settings").select("*").eq("id", 1).single(),
    supabase.from("profiles").select("*"),
    supabase.from("shift_assignments").select("*"),
    supabase.from("chatter_revenues").select("*")
  ]);

  const agency = agencyRes.data || { agency_name: "ET Management" };
  const chatterProfile = profilesRes.data || [];
  const assignments = shiftsRes.data || [];
  const revenues = revenueRes.data || [];
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black tracking-wide bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase">FINANZ-BUCHHALTUNG</h1>
        <p className="text-xs text-slate-400 mt-1">Hier verwaltest du deine Agenturdaten und ziehst alle Abrechnungen gesammelt ab.</p>
      </div>

      {/* 1. SEKTION: Optionale Agentur-Stammdaten einstellen */}
      <section className="bg-black/40 border border-[#AA7C11]/10 p-4 rounded-xl mb-8">
        <h2 className="text-xs font-bold text-[#D4AF37] mb-3 uppercase tracking-wider">Agentur-Stammdaten hinterlegen (Optional)</h2>
        <form action={updateAgencySettings} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <input type="text" name="agency_name" defaultValue={agency.agency_name} placeholder="Agentur Name" className="bg-[#050505] border border-[#AA7C11]/30 rounded p-2 text-white outline-none" />
          <input type="text" name="tax_id" defaultValue={agency.tax_id || ""} placeholder="Umsatzsteuer-ID / Steuernummer" className="bg-[#050505] border border-[#AA7C11]/30 rounded p-2 text-white outline-none" />
          <input type="text" name="address" defaultValue={agency.address || ""} placeholder="Firmenadresse" className="bg-[#050505] border border-[#AA7C11]/30 rounded p-2 text-white outline-none" />
          <input type="text" name="bank_details" defaultValue={agency.bank_details || ""} placeholder="Zahlungsdaten / IBAN für Fußzeile" className="col-span-1 sm:col-span-3 bg-[#050505] border border-[#AA7C11]/30 rounded p-2 text-white outline-none" />
          <div className="col-span-1 sm:col-span-3 flex justify-end"><button type="submit" className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black px-4 py-1 rounded font-bold hover:from-[#E5C158] transition cursor-pointer">Stammdaten sichern</button></div>
        </form>
      </section>

      {/* 2. SEKTION: Chatter-Kacheln mit automatischer Leistungsberechnung */}
      <section>
        <h2 className="text-xs font-bold text-[#D4AF37] mb-4 uppercase tracking-wider">Abrechnungen nach Mitarbeitern</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {chatterProfile.map((chatter) => {
            const userShifts = assignments.filter(a => a.chatter_id === chatter.user_id);
            const userRevenues = revenues.filter(r => r.user_id === chatter.user_id);
            
            let hrs = 0;
            userShifts.forEach(s => { if (s.started_at && s.ended_at) hrs += (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / (1000 * 60 * 60); });
            const rev = userRevenues.reduce((sum, r) => sum + Number(r.gross_amount || 0), 0);

            return (
              <div key={chatter.user_id} className="bg-black/30 border border-[#AA7C11]/20 rounded-xl p-4 flex flex-col justify-between hover:border-[#D4AF37]/40 transition">
                <div>
                  <div className="flex justify-between items-center border-b border-[#AA7C11]/10 pb-2 mb-2">
                    <span className="text-sm font-bold text-white tracking-wide">{chatter.full_name || "Mitarbeiter"}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{chatter.email}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono my-2 text-slate-300">
                    <div>Stunden: <span className="text-white font-bold">{hrs.toFixed(2)} h</span></div>
                    <div>Live-Umsatz: <span className="text-emerald-400 font-bold">${rev.toFixed(2)}</span></div>
                  </div>
                  <div className="text-[11px] text-slate-400 border-t border-[#AA7C11]/5 pt-2 mt-2">
                    <div><span>💳</span> <span className="text-[#D4AF37] font-semibold">Methode:</span> {chatter.zahlungs_methode || "Nicht hinterlegt"}</div>
                    <div className="truncate"><span>🔑</span> <span className="text-[#D4AF37] font-semibold">Details:</span> {chatter.zahlungs_details || "Keine Daten"}</div>
                  </div>
                </div>
                <button className="w-full mt-4 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#AA7C11]/30 text-[#D4AF37] rounded py-1 text-xs font-bold transition cursor-pointer">Abrechnung PDF laden</button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
