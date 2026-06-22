"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

export default function AbrechnungPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [abrechnungsDaten, setAbrechnungsDaten] = useState<any[]>([]);
  
  const [address, setAddress] = useState("");
  const [iban, setIban] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState("");
  const [cryptoWallet, setCryptoWallet] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    async function ladeEinmaligeStammdaten() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setCurrentUserId(user.id);
        const adminCheck = user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com";
        setIsAdmin(adminCheck);

        const { data: meinProfil } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
        if (meinProfil) {
          setAddress(meinProfil.chatter_address || "");
          setIban(meinProfil.chatter_iban || "");
          setCryptoNetwork(meinProfil.chatter_crypto_network || "");
          setCryptoWallet(meinProfil.chatter_crypto_wallet || "");
        }
      } catch (err) { console.error(err); }
    }
    ladeEinmaligeStammdaten();
  }, [supabase]);

  async function ladeAbrechnungsZentrale() {
    try {
      const [profilesRes, revenueRes, shiftsRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("chatter_revenues").select("*"),
        supabase.from("shift_assignments").select("*")
      ]);

      const profiles = profilesRes.data || [];
      const revenues = revenueRes.data || [];
      const shifts = shiftsRes.data || [];

      const erlaubteProfile = isAdmin 
        ? profiles.filter(p => p.user_id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4")
        : profiles.filter(p => p.user_id === currentUserId);

      const berechneteListe = erlaubteProfile.map(p => {
        let stunden = 0;
        shifts.forEach((s: any) => {
          if ((s.chatter_id || s.user_id) === p.user_id && s.started_at) {
            const von = new Date(s.started_at).getTime();
            const bis = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
            if (bis > von) stunden += (bis - von) / (1000 * 60 * 60);
          }
        });

        let brutto = 0;
        let netto = 0;
        revenues.forEach((r: any) => {
          if ((r.user_id || r.chatter_id) === p.user_id) {
            brutto += Number(r.gross_amount || r.amount || 0);
            netto += Number(r.amount || 0);
          }
        });

        const provisionsSatz = Number(p.provision_rate || 20);
        return {
          userId: p.user_id,
          name: p.full_name || "Mitarbeiter",
          email: p.email,
          hours: stunden,
          brutto: brutto,
          netto: netto,
          rate: provisionsSatz,
          auszahlung: netto * (provisionsSatz / 100),
          chatter_address: p.chatter_address || "",
          chatter_iban: p.chatter_iban || "",
          chatter_crypto_network: p.chatter_crypto_network || "",
          chatter_crypto_wallet: p.chatter_crypto_wallet || ""
        };
      });

      setAbrechnungsDaten(berechneteListe);
      setLoading(false);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    if (currentUserId) {
      ladeAbrechnungsZentrale();
      const interval = setInterval(ladeAbrechnungsZentrale, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUserId, isAdmin]);
  async function handleSaveProfile() {
    setSaveStatus("Speichert...");
    const { error } = await supabase
      .from("profiles")
      .update({
        chatter_address: address,
        chatter_iban: iban,
        chatter_crypto_network: cryptoNetwork,
        chatter_crypto_wallet: cryptoWallet
      })
      .eq("user_id", currentUserId);

    if (!error) {
      setSaveStatus("Erfolgreich aktualisiert!");
      setTimeout(() => setSaveStatus(""), 2000);
    } else {
      setSaveStatus("Fehler beim Speichern!");
    }
  }

  function druckeRechnung(daten: any) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // 🛡️ RADIKAL CLEAN: Wenn die Adresse leer ist, bleibt das Feld auf dem PDF unsichtbar
    const hatAdresse = daten.chatter_address && daten.chatter_address.trim();
    const gedruckteAdresse = hatAdresse ? daten.chatter_address.replace(/\n/g, "<br>") : "";

    // Baut den Auszahlungs-Kasten NUR, wenn auch wirklich Daten hinterlegt sind!
    let auszahlungsSektion = "";
    const hatIban = daten.chatter_iban && daten.chatter_iban.trim();
    const hatWallet = daten.chatter_crypto_wallet && daten.chatter_crypto_wallet.trim();

    if (hatIban || hatWallet) {
      auszahlungsSektion = `
        <div class="payout-details">
          <div class="section-title" style="border:0; margin-bottom:5px;">Hinterlegte Auszahlungsdaten</div>
          ${hatIban ? `<strong>Bankverbindung (IBAN):</strong> ${daten.chatter_iban}<br>` : ""}
          ${hatWallet ? `<strong>Krypto-Auszahlung:</strong> Wallet: ${daten.chatter_crypto_wallet} ${daten.chatter_crypto_network ? `(${daten.chatter_crypto_network})` : ""}` : ""}
        </div>
      `;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Abrechnung - ${daten.name}</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #111; padding: 45px; line-height: 1.5; }
            .header-grid { display: flex; justify-content: space-between; border-bottom: 3px solid #AA7C11; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 26px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #AA7C11; }
            .meta { font-size: 11px; color: #555; text-align: right; font-family: monospace; }
            .address-box { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 35px; font-size: 12px; }
            .address-col { flex: 1; }
            .section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; color: #AA7C11; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 4px; letter-spacing: 1px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
            th { background: #f9f9f9; font-weight: bold; color: #444; text-transform: uppercase; font-size: 10px; }
            .total-box { background: #fffdf6; border: 1px solid #AA7C11; padding: 20px; border-radius: 6px; text-align: right; margin-top: 35px; }
            .total-label { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #666; letter-spacing: 1px; }
            .total-amount { font-size: 24px; font-weight: 900; color: #AA7C11; font-family: monospace; margin-top: 5px; }
            .payout-details { margin-top: 30px; background: #fdfdfd; border: 1px solid #eee; padding: 15px; border-radius: 6px; font-size: 12px; }
            .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header-grid">
            <div>
              <div class="title">ET MANAGEMENT INVOICE</div>
              <div style="font-size: 12px; color: #666; margin-top: 4px;">Leistungsabrechnung für Chatter-Dienstleistungen</div>
            </div>
            <div class="meta">
              <strong>Rechnungs-ID:</strong> INV-${daten.userId.slice(0,8).toUpperCase()}-${new Date().getMonth() + 1}<br>
              <strong>Datum:</strong> ${new Date().toLocaleDateString('de-DE')}<br>
              <strong>Status:</strong> Berechnet / Auszahlungsbereit
            </div>
          </div>
          <div class="address-box">
            <div class="address-col">
              <div class="section-title">Rechnungsaussteller (Chatter)</div>
              <strong>${daten.name}</strong><br>
              ${gedruckteAdresse}<br>
              Email: ${daten.email}
            </div>
            <div class="address-col">
              <div class="section-title">Rechnungsempfänger (Leistungsnehmer)</div>
              <strong>ET Management Agency</strong><br>etmanagement@gmail.com<br>Deutschland / Europa
            </div>
          </div>
          <div class="section">
            <div class="section-title">Leistungsübersicht & Performance-Nachweis</div>
            <table>
              <thead>
                <tr><th>Beschreibung der Dienstleistung</th><th>Einheiten / Umsatz</th><th>Plattform-Status</th></tr>
              </thead>
              <tbody>
                <tr><td>Geleistete Schicht-Arbeitszeit via Stechuhr</td><td><strong>${daten.hours.toFixed(2)} h</strong></td><td>Verifiziert</td></tr>
                <tr><td>Generierter Brutto-Gesamtumsatz</td><td><strong>$${daten.brutto.toFixed(2)}</strong></td><td>Supercreator Brutto</td></tr>
                <tr><td>Netto OnlyFans Account-Eingang (80%)</td><td><strong>$${daten.netto.toFixed(2)}</strong></td><td>Netto nach OF-Gebühr</td></tr>
                <tr><td>Vereinbarte prozentuale Beteiligung</td><td><strong>${daten.rate}%</strong></td><td>Vertragliche Provision</td></tr>
              </tbody>
            </table>
          </div>
          <div class="total-box">
            <div class="total-label">Guthaben / Rechnungsbetrag zur Auszahlung</div>
            <div class="total-amount">$${daten.auszahlung.toFixed(2)}</div>
          </div>
          ${auszahlungsSektion}
          <div class="footer">Diese Gutschrift-Abrechnung wurde vollautomatisch erstellt und ist digital gültig.</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">
          {isAdmin ? "ET Agency Abrechnungs-Zentrale" : "Deine Chatter Abrechnung & Stammdaten"}
        </h1>
        <p className="text-xs text-slate-400 mt-1">Verwalte deine Auszahlungsdaten und drucke deine verifizierten Abrechnungsbelege</p>
      </div>

      {/* 🔓 UNBLOCKIERBAR: Die Felder nutzen jetzt echten Text-Fluss und frieren niemals wieder ein! */}
      {!isAdmin && (
        <section className="mb-8 bg-black/50 p-5 rounded-xl border border-[#AA7C11]/20 shadow-xl">
          <h2 className="text-xs font-black text-[#D4AF37] uppercase tracking-widest mb-4">📝 Deine Rechnungsanschrift & Auszahlungsdaten hinterlegen (Optional)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Vollständige Anschrift (Straße, PLZ, Ort)</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Musterstraße 1, 12345 Musterstadt" className="w-full h-20 bg-black border border-[#AA7C11]/20 rounded p-2 text-white outline-none focus:border-[#D4AF37] transition" />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Bankverbindung (IBAN)</label>
                <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE12 3456 7890 ..." className="w-full bg-black border border-[#AA7C11]/20 rounded p-2 text-white outline-none focus:border-[#D4AF37] transition" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Krypto Netz</label>
                  <input type="text" value={cryptoNetwork} onChange={(e) => setCryptoNetwork(e.target.value)} placeholder="USDT TRC20" className="w-full bg-black border border-[#AA7C11]/20 rounded p-2 text-white outline-none focus:border-[#D4AF37] transition" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Crypto Wallet Adresse</label>
                  <input type="text" value={cryptoWallet} onChange={(e) => setCryptoWallet(e.target.value)} placeholder="T9xZ..." className="w-full bg-black border border-[#AA7C11]/20 rounded p-2 text-white outline-none focus:border-[#D4AF37] transition" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center mt-4">
            <button onClick={handleSaveProfile} className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] text-black text-xs font-black px-5 py-2 rounded uppercase cursor-pointer transition">Auszahlungsdaten Aktualisieren / Speichern</button>
            {saveStatus && <span className="text-xs font-mono text-emerald-400 animate-pulse">{saveStatus}</span>}
          </div>
        </section>
      )}

      {/* Abrechnungsliste */}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 mt-3 text-xs">
                <div className="text-slate-400">Schichtzeit: <span className="text-white font-mono">{daten.hours.toFixed(2)} h</span></div>
                <div className="text-slate-400">Umsatz Brutto: <span className="text-amber-200 font-mono">${daten.brutto.toFixed(2)}</span></div>
                <div className="text-slate-400">Netto-Eingang: <span className="text-emerald-400 font-mono">${daten.netto.toFixed(2)}</span></div>
              </div>
            </div>
            <div className="flex items-center justify-between w-full md:w-auto md:justify-end gap-4 border-t border-[#AA7C11]/5 pt-3 md:border-t-0 md:pt-0">
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Auszahlungsbetrag:</div>
                <div className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F3E5AB] via-[#D4AF37] to-[#AA7C11] font-mono">
                  ${daten.auszahlung.toFixed(2)}
                </div>
              </div>
              <button onClick={() => druckeRechnung(daten)} className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] text-black text-xs font-black px-4 py-2.5 rounded-lg uppercase tracking-wider shadow-md cursor-pointer transition">🖨️ PDF Rechnung</button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
