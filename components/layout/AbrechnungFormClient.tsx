"use client";

import { useState, useMemo } from "react";

export default function AbrechnungFormClient({ profile, actionTarget }: { profile: any; actionTarget: any }) {
  const [methode, setMethode] = useState(profile?.zahlungs_methode || "Banküberweisung");

  // Ändert dynamisch den Beschreibungstext je nach Auswahl
  const detailPlaceholder = useMemo(() => {
    if (methode === "Banküberweisung") return "Deine IBAN & BIC eingeben...";
    if (methode === "USDT (Tether)") return "Deine Tether Wallet-Adresse (TRC-20) eintragen...";
    if (methode === "Ethereum (ETH)" || methode === "Solana (SOL)" || methode === "Litecoin (LTC)") {
      return `Deine ${methode} Wallet-Adresse eintragen...`;
    }
    return "Auszahlungs-Details eintragen...";
  }, [methode]);

  return (
    <form action={actionTarget} className="space-y-4 text-xs text-white">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-400 font-bold mb-1 uppercase text-[10px]">Rechnungsadresse (Dein Name & Anschrift)</label>
          <textarea name="rechnungs_adresse" defaultValue={profile?.rechnungs_adresse || ""} placeholder="Max Mustermann&#10;Musterstraße 1&#10;12345 Stadt" rows={3} className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded p-2 text-white outline-none focus:border-[#D4AF37] resize-none" />
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-slate-400 font-bold mb-1 uppercase text-[10px]">Steuernummer / Steuer-ID (Falls vorhanden)</label>
            <input type="text" name="steuer_id" defaultValue={profile?.steuer_id || ""} placeholder="Steuernummer eintragen" className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded p-2 text-white outline-none focus:border-[#D4AF37]" />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1 uppercase text-[10px]">Auszahlungsmethode</label>
            <select name="zahlungs_methode" value={methode} onChange={(e) => setMethode(e.target.value)} className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded p-2 text-white outline-none focus:border-[#D4AF37] cursor-pointer">
              <option value="Banküberweisung">Banküberweisung (SEPA)</option>
              <option value="USDT (Tether)">USDT (Tether - TRC20)</option>
              <option value="Ethereum (ETH)">Ethereum (ETH)</option>
              <option value="Solana (SOL)">Solana (SOL)</option>
              <option value="Litecoin (LTC)">Litecoin (LTC)</option>
              <option value="Paxum">Paxum</option>
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-slate-400 font-bold mb-1 uppercase text-[10px]">Auszahlungsdetails (Wallet oder Kontodaten)</label>
        <input type="text" name="zahlungs_details" defaultValue={profile?.zahlungs_details || ""} placeholder={detailPlaceholder} required className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded p-2 text-white outline-none focus:border-[#D4AF37] font-mono" />
      </div>
      <div className="flex justify-end">
        <button type="submit" className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black px-4 py-2 rounded-md font-bold hover:from-[#E5C158] transition cursor-pointer">Zahlungsdaten speichern</button>
      </div>
    </form>
  );
}
