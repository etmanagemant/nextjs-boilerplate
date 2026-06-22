"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

export default function AbrechnungPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  
  const [abrechnungsDaten, setAbrechnungsDaten] = useState<any[]>([]);

  async function ladeAbrechnungen() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);
      const adminCheck = user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com";
      setIsAdmin(adminCheck);

      // Daten parallel aus Supabase laden
      const [profilesRes, revenueRes, shiftsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email, provision_rate"),
        supabase.from("chatter_revenues").select("*"),
        supabase.from("shift_assignments").select("*")
      ]);

      const profiles = profilesRes.data || [];
      const revenues = revenueRes.data || [];
      const shifts = shiftsRes.data || [];

      // Filter: Admin sieht alle, Chatter sieht nur sich selbst!
      const erlaubteProfile = adminCheck 
        ? profiles.filter(p => p.user_id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4")
        : profiles.filter(p => p.user_id === user.id);

      const berechneteListe = erlaubteProfile.map(p => {
        // 1. Stunden aus Stechuhr summieren
        let stunden = 0;
        shifts.forEach((s: any) => {
          if ((s.chatter_id || s.user_id) === p.user_id && s.started_at) {
            const von = new Date(s.started_at).getTime();
            const bis = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
            if (bis > von) stunden += (bis - von) / (1000 * 60 * 60);
          }
        });

        // 2. Umsätze auswerten (Brutto & Netto)
        let brutto = 0;
        let netto = 0;
        revenues.forEach((r: any) => {
          if ((r.user_id || r.chatter_id) === p.user_id) {
            brutto += Number(r.gross_amount || r.amount || 0);
            netto += Number(r.amount || 0);
          }
        });

        // 🤖 DER AUTOMATISCHE PROVISIONS-RECHNER
        const provisionsSatz = Number(p.provision_rate || 20); // Fallback 20%
        const auszahlungBetrag = netto * (provisionsSatz / 100);

        return {
          userId: p.user_id,
          name: p.full_name || "Mitarbeiter",
          email: p.email,
          hours: stunden,
          brutto: brutto,
          netto: netto,
          rate: provisionsSatz,
          auszahlung: auszahlungBetrag
        };
      });

      setAbrechnungsDaten(berechneteListe);
      setLoading(false);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    ladeAbrechnungen();
  }, [supabase]);

  // 🖨️ DIE UNZERSTÖRBARE PDF-DRUCK-FUNKTION (Nutzt den sauberen Browser-Print-Befehl)
  function druckeRechnung(daten: any) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Abrechnung - ${daten.name}</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #111; padding: 40px; }
            .header { border-b: 2px solid #AA7C11; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; uppercase; letter-spacing: 1px; color: #AA7C11; }
            .meta { font-size: 12px; color: #555; margin-top: 5px; font-family: monospace; }
            .section { margin-bottom: 25px; }
            .section-title { font-size: 14px; font-weight: bold; uppercase; color: #AA7C11; margin-bottom: 10px; border-b: 1px solid #eee; padding-bottom: 3px; }
            table { w-full border-collapse: collapse; margin-top: 15px; font-size: 13px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
            th { background: #fafafa; font-weight: bold; color: #555; text-transform: uppercase; font-size: 11px; }
            .total-box { background: #fdfaf2; border: 1px solid #AA7C11/30; padding: 15px; rounded: 8px; text-align: right; margin-top: 30px; }
            .total-label { font-size: 12px; font-weight: bold; uppercase; color: #777; }
            .total-amount { font-size: 22px; font-weight: black; color: #AA7C11; font-family: monospace; margin-top: 5px; }
            .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">ET MANAGEMENT INVOICE</div>
            <div class="meta">Abrechnungszeitraum: TÄGLICH / MONATLICH | Erstellt am: ${new Date().toLocaleDateString('de-DE')}</div>
          </div>
          <div class="section">
            <div class="section-title">Empfänger (Chatter)</div>
            <strong>Name:</strong> ${daten.name}<br>
            <strong>E-Mail:</strong> ${daten.email}
          </div>
          <div class="section">
            <div class="section-title">Leistungsnachweis & Performance</div>
            <table>
              <thead>
                <tr>
                  <th>Posten</th>
                  <th>Wert / Einheiten</th>
                  <th>Gebühren-Status</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Geleistete Arbeitszeit</td><td><strong>${daten.hours.toFixed(2)} Stunden</strong></td><td>Erfasst via Stechuhr</td></tr>
                <tr><td>Generierter Brutto-Umsatz</td><td><strong>$${daten.brutto.toFixed(2)}</strong></td><td>Kunden-Zahlungen (100%)</td></tr>
                <tr><td>Netto OnlyFans-Eingang</td><td><strong>$${daten.netto.toFixed(2)}</strong></td><td>Abzüglich 20% OF-Plattformgebühr</td></tr>
                <tr><td>Deine vertragliche Provision</td><td><strong>${daten.rate}%</strong></td><td>Hinterlegt im Admin-Management</td></tr>
              </tbody>
            </table>
          </div>
          <div class="total-box">
            <div class="total-label">Dein Netto-Auszahlungsbetrag</div>
            <div class="total-amount">$${daten.auszahlung.toFixed(2)}</div>
          </div>
          <div class="footer">
            ETManagement © 2026 | Diese Abrechnung wurde elektronisch generiert und ist ohne Unterschrift gültig.
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  if (loading) return <div className="text-center pt-24 font-bold text-[#D4AF37] animate-pulse">Lade Abrechnungs-Zentrale...</div>;
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">
          {isAdmin ? "ET Agency Abrechnungen (Admin)" : "Deine Chatter Abrechnung"}
        </h1>
        <p className="text-xs text-slate-400 mt-1">Automatische Provisionsberechnung basierend auf euren Netto-Plattform-Einnahmen</p>
      </div>

      <div className="space-y-4">
        {abrechnungsDaten.map((daten, idx) => (
          <div key={idx} className="bg-black/40 p-5 rounded-xl border border-[#AA7C11]/10 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition hover:border-[#AA7C11]/20">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">{daten.name}</h2>
                <span className="bg-[#AA7C11]/10 border border-[#AA7C11]/30 text-[#D4AF37] text-[10px] font-mono px-2 py-0.5 rounded">
                  {daten.rate}% Provision
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{daten.email}</p>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 mt-3 text-xs">
                <div className="text-slate-400">Arbeitszeit: <span className="text-white font-mono">{daten.hours.toFixed(2)} h</span></div>
                <div className="text-slate-400">Umsatz Brutto: <span className="text-amber-200 font-mono">${daten.brutto.toFixed(2)}</span></div>
                <div className="text-slate-400">Account Netto: <span className="text-emerald-400 font-mono">${daten.netto.toFixed(2)}</span></div>
              </div>
            </div>

            <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-4 border-t border-[#AA7C11]/5 pt-3 md:border-t-0 md:pt-0">
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Deine Auszahlung:</div>
                <div className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] font-mono">
                  ${daten.auszahlung.toFixed(2)}
                </div>
              </div>
              
              <button 
                onClick={() => druckeRechnung(daten)}
                className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] text-black text-xs font-black px-4 py-2.5 rounded-lg uppercase tracking-wider shadow-md cursor-pointer transition"
              >
                🖨️ PDF Rechnung
              </button>
            </div>
          </div>
        ))}

        {abrechnungsDaten.length === 0 && (
          <div className="text-center p-12 text-xs text-slate-500 font-mono uppercase tracking-wider bg-black/20 rounded-xl border border-[#AA7C11]/5">
            Aktuell liegen keine abrechenbaren Performance-Daten für diesen Zeitraum vor.
          </div>
        )}
      </div>
    </main>
  );
}
