"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

export default function AbrechnungPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("chatter");
  const [abrechnungsDaten, setAbrechnungsDaten] = useState<any[]>([]);
  const [moderatorStriptchatData, setModeratorStriptchatData] = useState<any>(null);
  
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
        
        const { data: userProfile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
        if (userProfile?.role) {
          setCurrentUserRole(userProfile.role);
        }
        if (userProfile) {
          setAddress(userProfile.chatter_address || "");
          setIban(userProfile.chatter_iban || "");
          setCryptoNetwork(userProfile.chatter_crypto_network || "");
          setCryptoWallet(userProfile.chatter_crypto_wallet || "");
        }
      } catch (err) { console.error(err); }
    }
    ladeEinmaligeStammdaten();
  }, [supabase]);

  async function ladeAbrechnungsZentrale() {
    if (!currentUserId) return;
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
        let privatShowStunden = 0;
        let privatShowCount = 0; // 🎭 NEUE METRIK für Prämien
        
        shifts.forEach((s: any) => {
          if ((s.chatter_id || s.user_id) === p.user_id && s.started_at) {
            const von = new Date(s.started_at).getTime();
            const bis = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
            if (bis > von) {
              stunden += (bis - von) / (1000 * 60 * 60);
            }
            if (s.privateshow_total_hours) {
              privatShowStunden += Number(s.privateshow_total_hours);
            }
            if (s.privateshow_count) {
              privatShowCount += Number(s.privateshow_count);
            }
          }
        });

        // 🎁 PRÄMIEN-SYSTEM für Moderatoren
        let praemie = 0;
        if (p.role === "moderator") {
          if (privatShowCount >= 25) {
            praemie = 70; // 25+ Shows = 70€
          } else if (privatShowCount >= 20) {
            praemie = 50; // 20+ Shows = 50€
          } else if (privatShowCount >= 15) {
            praemie = 30; // 15+ Shows = 30€
          }
        }

        let brutto = 0;
        let netto = 0;
        let striptchatBrutto = 0;
        let striptchatNetto = 0;
        
        revenues.forEach((r: any) => {
          if ((r.user_id || r.chatter_id) === p.user_id) {
            const bruttoWert = Number(r.gross_amount || r.amount || 0);
            const nettoWert = Number(r.amount || 0);
            
            if (r.platform === "stripchat") {
              striptchatBrutto += bruttoWert;
              striptchatNetto += nettoWert;
            } else {
              brutto += bruttoWert;
              netto += nettoWert;
            }
          }
        });

        const provisionsSatz = Number(p.provision_rate || 20);
        const hourlyRate = Number(p.hourly_rate || 0);
        
        // 🎯 UNTERSCHIEDLICHE BERECHNUNG je nach Rolle
        let auszahlung = 0;
        let auszahlungStripchat = 0;
        
        if (p.role === "moderator") {
          // Moderator: Stundenhonorar + Prämie
          auszahlungStripchat = (stunden * hourlyRate) + praemie;
        } else {
          // Chatter: Provision (%)
          auszahlung = netto * (provisionsSatz / 100);
          auszahlungStripchat = striptchatNetto * (provisionsSatz / 100);
        }
        
        return {
          userId: p.user_id,
          name: p.full_name || "Mitarbeiter",
          email: p.email,
          role: p.role,
          hours: stunden,
          privatShowHours: privatShowStunden,
          privatShowCount: privatShowCount, // 🎭 Neu
          praemie: praemie, // 🎁 Neu
          brutto: brutto,
          netto: netto,
          striptchatBrutto: striptchatBrutto,
          striptchatNetto: striptchatNetto,
          rate: provisionsSatz,
          hourlyRate: hourlyRate, // 💰 Neu
          auszahlung: auszahlung,
          auszahlungStripchat: auszahlungStripchat
        };
      });
      
      if (currentUserRole === "moderator" && berechneteListe.length > 0) {
        setModeratorStriptchatData(berechneteListe[0]);
      }

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
      setSaveStatus("✅ Erfolgreich gespeichert!");
      setTimeout(() => setSaveStatus(""), 2000);
    } else {
      setSaveStatus("❌ Fehler beim Speichern");
    }
  }

  if (loading) return <div className="text-center pt-24 font-bold text-[#D4AF37] animate-pulse">Lade Abrechnungsdaten...</div>;

  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
      <div className="mb-6 border-b border-[#AA7C11]/20 pb-4">
        <h1 className="text-2xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">
          {isAdmin ? "💰 ET Agency Abrechnungs-Zentrale" : "Deine Abrechnung & Auszahlungsdaten"}
        </h1>
        <p className="text-xs text-slate-400 mt-1">Übersicht deiner Einnahmen, Schichtstunden und Provisionsberechnungen</p>
      </div>

      {!isAdmin && (
        <section className="mb-8 bg-black/50 p-5 rounded-xl border border-[#AA7C11]/20 shadow-xl">
          <h2 className="text-xs font-black text-[#D4AF37] uppercase tracking-widest mb-4"><span>📝</span> <span>Deine Zahlungsdaten hinterlegen</span></h2>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Adresse</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" placeholder="Straße, PLZ, Ort" className="w-full h-16 bg-black border border-[#AA7C11]/20 rounded p-2 text-white outline-none focus:border-[#D4AF37]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">IBAN</label>
                <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} autoComplete="off" placeholder="DE..." className="w-full bg-black border border-[#AA7C11]/20 rounded p-2 text-white outline-none focus:border-[#D4AF37]" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Crypto Netz</label>
                <input type="text" value={cryptoNetwork} onChange={(e) => setCryptoNetwork(e.target.value)} autoComplete="off" placeholder="z.B. TRC20" className="w-full bg-black border border-[#AA7C11]/20 rounded p-2 text-white outline-none focus:border-[#D4AF37]" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Crypto Wallet</label>
              <input type="text" value={cryptoWallet} onChange={(e) => setCryptoWallet(e.target.value)} autoComplete="off" placeholder="Wallet Adresse..." className="w-full bg-black border border-[#AA7C11]/20 rounded p-2 text-white outline-none focus:border-[#D4AF37]" />
            </div>
            <button onClick={handleSaveProfile} className="w-full bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] text-black text-xs font-bold px-3 py-2 rounded uppercase cursor-pointer"><span>💾</span> Daten speichern</button>
            {saveStatus && <div className="text-center text-xs font-mono text-emerald-400">{saveStatus}</div>}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {abrechnungsDaten.map((daten, idx) => (
          <div key={idx} className="bg-black/40 p-5 rounded-xl border border-[#AA7C11]/10 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-white">{daten.name}</h2>
              {daten.role === "moderator" ? (
                <span className="bg-purple-600/20 border border-purple-500/30 text-purple-300 text-[10px] font-mono px-2 py-0.5 rounded">💰 EUR {daten.hourlyRate.toFixed(2)}/h</span>
              ) : (
                <span className="bg-[#AA7C11]/10 border border-[#AA7C11]/30 text-[#D4AF37] text-[10px] font-mono px-2 py-0.5 rounded">{daten.rate}% Provision</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#050505]/60 p-2 rounded border border-[#AA7C11]/10">
                <div className="text-slate-400 font-bold text-[10px] mb-1">STUNDEN</div>
                <div className="font-mono font-bold text-[#D4AF37]">{daten.hours.toFixed(2)}h</div>
              </div>
              
              {daten.role === "moderator" ? (
                <>
                  <div className="bg-[#050505]/60 p-2 rounded border border-purple-500/20">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">💰 STUNDENHONORAR</div>
                    <div className="font-mono font-bold text-purple-300">${(daten.hourlyRate * daten.hours).toFixed(2)}</div>
                  </div>
                  <div className="bg-[#050505]/60 p-2 rounded border border-pink-500/20">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">🎁 PRÄMIE</div>
                    <div className="font-mono font-bold text-pink-300">${daten.praemie.toFixed(2)}</div>
                  </div>
                  <div className="bg-[#050505]/60 p-2 rounded border border-emerald-500/20">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">💵 AUSZAHLUNG</div>
                    <div className="font-mono font-bold text-emerald-300">${daten.auszahlungStripchat.toFixed(2)}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-[#050505]/60 p-2 rounded border border-[#AA7C11]/10">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">BRUTTO</div>
                    <div className="font-mono font-bold text-white">${daten.brutto.toFixed(2)}</div>
                  </div>
                  <div className="bg-[#050505]/60 p-2 rounded border border-[#AA7C11]/10">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">NETTO</div>
                    <div className="font-mono font-bold text-emerald-400">${daten.netto.toFixed(2)}</div>
                  </div>
                  <div className="bg-[#050505]/60 p-2 rounded border border-[#AA7C11]/10">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">AUSZAHLUNG ({daten.rate}%)</div>
                    <div className="font-mono font-bold text-[#F3E5AB]">${daten.auszahlung.toFixed(2)}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
