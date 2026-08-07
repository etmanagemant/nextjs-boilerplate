import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import { updateAgencySettings } from "@/app/abrechnung/actions";
import { hasFeatureAccess } from "@/lib/roles";
import { fetchRolePermissionMap } from "@/lib/getRolePermissions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const TEST_MODEL_ID = "d7976e92-434e-488a-8ec4-bba92eb31dcf";

export default async function BuchhaltungPage({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  const { supabase, user } = await getCurrentUser();

  // Harte Absicherung: Chatter fliegen sofort raus!
  if (!user) { redirect("/login"); }
  const adminCheck = await getCurrentProfile(user.id);
  const grantedBuchhaltung = await fetchRolePermissionMap(supabase, adminCheck?.role);
  if (user.email !== "etmanagement@gmail.com" && user.email !== "etmanagemant@gmail.com" && !hasFeatureAccess(adminCheck?.role, "buchhaltung", grantedBuchhaltung)) { redirect("/"); }

  // Explizit gewuenscht (2026-08-07): Abrechnungsmonat statt "seit
  // Projektbeginn fuer immer" - ?monat=0 aktueller Monat, hoeher = weiter
  // zurueck. Server-Component, deshalb ueber die URL statt useState.
  const monthOffset = Math.max(0, Number((await searchParams).monat) || 0);
  const now = new Date();
  const monthDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  const monthLabel = monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  // Daten parallel laden
  const [agencyRes, profilesRes, shiftsRes, revenueRes, invoicesRes] = await Promise.all([
    supabase.from("agency_settings").select("*").eq("id", 1).single(),
    supabase.from("profiles").select("*"),
    supabase.from("shift_assignments").select("*")
      .gte("started_at", monthStart.toISOString()).lt("started_at", monthEnd.toISOString()),
    // Bugfix (gemeldet 2026-08-07): Testmodel-Umsaetze flossen bisher
    // ungefiltert mit ein, und es gab ueberhaupt keinen Zeitraum - beides
    // verfaelscht die echte Auszahlungssumme.
    supabase.from("chatter_revenues").select("*")
      .gte("created_at", monthStart.toISOString()).lt("created_at", monthEnd.toISOString())
      .neq("model_id", TEST_MODEL_ID),
    // Explizit gewuenscht (2026-08-07): Chatter-selbst-generierte Rechnungen
    // fuer den Admin einsehbar machen.
    supabase.from("crm_invoices").select("*").eq("month_start", monthStart.toISOString().slice(0, 10)),
  ]);

  const agency = agencyRes.data || { agency_name: "ET Management" };
  // Bugfix (gemeldet 2026-08-07): Model-Rollen-Accounts (nur zum Content-
  // Hochladen da) tauchten hier als Mitarbeiter-Kachel auf.
  const chatterProfile = (profilesRes.data || []).filter((p) => p.role !== "model");
  const assignments = shiftsRes.data || [];
  const revenues = revenueRes.data || [];
  const invoices = invoicesRes.data || [];
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#E2C48A] rounded-2xl my-6 border border-white/5 shadow-2xl">
      <div className="mb-6 border-b border-white/5 pb-4">
        <h1 className="text-2xl font-black tracking-wide bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent uppercase">FINANZ-BUCHHALTUNG</h1>
        <p className="text-xs text-slate-400 mt-1">Hier verwaltest du deine Agenturdaten und ziehst alle Abrechnungen gesammelt ab.</p>
      </div>

      <div className="flex items-center justify-between mb-6 bg-black/40 p-3 rounded-xl border border-[#9C7A3D]/10">
        <span className="text-sm font-bold text-[#C9A86A]">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <Link href={`/buchhaltung?monat=${monthOffset + 1}`} title="Vorheriger Monat" className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-[#E2C48A] hover:border-[#C9A86A]/40">←</Link>
          {monthOffset > 0 ? (
            <Link href={`/buchhaltung?monat=${monthOffset - 1}`} title="Nächster Monat" className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-[#E2C48A] hover:border-[#C9A86A]/40">→</Link>
          ) : (
            <span className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-slate-700">→</span>
          )}
        </div>
      </div>

      {/* 1. SEKTION: Optionale Agentur-Stammdaten einstellen */}
      <section className="bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-xl shadow-black/20 p-4 rounded-2xl mb-8">
        <h2 className="text-xs font-bold text-[#C9A86A] mb-3 uppercase tracking-wider">Agentur-Stammdaten hinterlegen (Optional)</h2>
        <form action={updateAgencySettings} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <input type="text" name="agency_name" defaultValue={agency.agency_name} placeholder="Agentur Name" className="bg-[#050505] border border-[#9C7A3D]/30 rounded p-2 text-white outline-none" />
          <input type="text" name="tax_id" defaultValue={agency.tax_id || ""} placeholder="Umsatzsteuer-ID / Steuernummer" className="bg-[#050505] border border-[#9C7A3D]/30 rounded p-2 text-white outline-none" />
          <input type="text" name="address" defaultValue={agency.address || ""} placeholder="Firmenadresse" className="bg-[#050505] border border-[#9C7A3D]/30 rounded p-2 text-white outline-none" />
          <input type="text" name="bank_details" defaultValue={agency.bank_details || ""} placeholder="Zahlungsdaten / IBAN für Fußzeile" className="col-span-1 sm:col-span-3 bg-[#050505] border border-[#9C7A3D]/30 rounded p-2 text-white outline-none" />
          <div className="col-span-1 sm:col-span-3 flex justify-end"><button type="submit" className="bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black px-4 py-1 rounded font-bold hover:from-[#E5C158] transition cursor-pointer">Stammdaten sichern</button></div>
        </form>
      </section>

      {/* 2. SEKTION: Chatter-Kacheln mit automatischer Leistungsberechnung */}
      <section>
        <h2 className="text-xs font-bold text-[#C9A86A] mb-4 uppercase tracking-wider">Abrechnungen nach Mitarbeitern</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {chatterProfile.map((chatter) => {
            const userShifts = assignments.filter(a => a.chatter_id === chatter.user_id);
            const userRevenues = revenues.filter(r => r.user_id === chatter.user_id);
            
            let hrs = 0;
            userShifts.forEach(s => { if (s.started_at && s.ended_at) hrs += (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / (1000 * 60 * 60); });
            const rev = userRevenues.reduce((sum, r) => sum + Number(r.gross_amount || 0), 0);

            return (
              <div key={chatter.user_id} className="bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20 rounded-2xl p-4 flex flex-col justify-between hover:border-[#C9A86A]/40 transition-colors duration-300">
                <div>
                  <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-2">
                    <span className="text-sm font-bold text-white tracking-wide">{chatter.full_name || "Mitarbeiter"}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{chatter.email}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono my-2 text-slate-300">
                    <div>Stunden: <span className="text-white font-bold">{hrs.toFixed(2)} h</span></div>
                    <div>Live-Umsatz: <span className="text-emerald-400 font-bold">${rev.toFixed(2)}</span></div>
                  </div>
                  <div className="text-[11px] text-slate-400 border-t border-white/5 pt-2 mt-2">
                    <div><span>💳</span> <span className="text-[#C9A86A] font-semibold">Methode:</span> {chatter.zahlungs_methode || "Nicht hinterlegt"}</div>
                    <div className="truncate"><span>🔑</span> <span className="text-[#C9A86A] font-semibold">Details:</span> {chatter.zahlungs_details || "Keine Daten"}</div>
                  </div>
                </div>
                {/* Bugfix (gemeldet 2026-08-07): war ein Button ohne
                    onClick-Handler, komplett totes Feature. Echter
                    Download-Link auf die neue PDF-Route, gleicher Monat
                    wie oben ausgewaehlt. */}
                <a
                  href={`/api/buchhaltung/abrechnung-pdf?userId=${chatter.user_id}&monat=${monthOffset}`}
                  className="w-full mt-4 block text-center bg-[#C9A86A]/10 hover:bg-[#C9A86A]/20 border border-[#9C7A3D]/30 text-[#C9A86A] rounded py-1 text-xs font-bold transition cursor-pointer"
                >
                  Abrechnung PDF laden
                </a>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. SEKTION: Von Mitarbeitern selbst generierte Rechnungen (2026-08-07) */}
      <section className="mt-8">
        <h2 className="text-xs font-bold text-[#C9A86A] mb-4 uppercase tracking-wider">Eingereichte Rechnungen der Mitarbeiter — {monthLabel}</h2>
        {invoices.length === 0 ? (
          <div className="text-xs text-slate-500 bg-black/30 p-4 rounded-xl border border-white/5">Noch keine Rechnung für diesen Monat generiert.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#9C7A3D]/10 bg-[#050505] text-[#C9A86A] font-semibold text-xs uppercase tracking-wider">
                  <th className="p-3">Mitarbeiter</th>
                  <th className="p-3">Rechnungsnummer</th>
                  <th className="p-3">Betrag</th>
                  <th className="p-3">Erstellt am</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const p = chatterProfile.find((c) => c.user_id === inv.user_id);
                  return (
                    <tr key={inv.id} className="border-b border-[#9C7A3D]/5 hover:bg-black/20 transition text-xs">
                      <td className="p-3 font-semibold text-white">{p?.full_name || "Unbekannt"}</td>
                      <td className="p-3 font-mono text-slate-400">{inv.invoice_number}</td>
                      <td className="p-3 font-mono font-bold text-emerald-400">${Number(inv.amount).toFixed(2)}</td>
                      <td className="p-3 text-slate-400">{new Date(inv.generated_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="p-3">
                        <a href={`/api/abrechnung/rechnung-pdf?userId=${inv.user_id}&monat=${monthOffset}`} className="text-[#C9A86A] hover:text-[#E2C48A] font-bold">Ansehen</a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
