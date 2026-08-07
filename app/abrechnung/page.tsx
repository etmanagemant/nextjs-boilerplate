"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

const TEST_MODEL_ID = "d7976e92-434e-488a-8ec4-bba92eb31dcf";

export default function AbrechnungPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("chatter");
  const [abrechnungsDaten, setAbrechnungsDaten] = useState<any[]>([]);
  const [moderatorStriptchatData, setModeratorStriptchatData] = useState<any>(null);
  // Explizit gewuenscht (2026-08-07): Abrechnung monatlich statt seit
  // Projektbeginn fuer immer zusammengerechnet - gleiches Muster wie das
  // Dashboard-Diagramm (0 = aktueller Monat, hoeher = weiter zurueck).
  const [monthOffset, setMonthOffset] = useState(0);
  const [monthLabel, setMonthLabel] = useState("");
  
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
        // Bugfix (gemeldet 2026-08-07): fehlte hier die "etmanagemant"-
        // Tippfehler-Variante, die ueberall sonst im Code mitgeprueft wird -
        // die echte Admin-Mail hat genau diesen Tippfehler.
        const adminCheck = user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
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
      // Explizit gewuenscht (2026-08-07): Abrechnungsmonat statt "seit
      // Projektbeginn fuer immer" - monthOffset 0 = aktueller Monat.
      const now = new Date();
      const monthDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      setMonthLabel(monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" }));

      const [profilesRes, revenueRes, shiftsRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        // Bugfix (gemeldet 2026-08-07): Testmodel-Umsaetze (Live-Tests
        // dieser Session) flossen bisher ungefiltert in die echte
        // Provisionsberechnung mit ein - bei Auszahlungslogik der
        // schwerwiegendste der beiden Bugs hier.
        supabase.from("chatter_revenues").select("*")
          .gte("created_at", monthStart.toISOString()).lt("created_at", monthEnd.toISOString())
          .neq("model_id", TEST_MODEL_ID),
        supabase.from("shift_assignments").select("*")
          .gte("started_at", monthStart.toISOString()).lt("started_at", monthEnd.toISOString()),
      ]);

      const profiles = profilesRes.data || [];
      const revenues = revenueRes.data || [];
      const shifts = shiftsRes.data || [];

      // Bugfix (gemeldet 2026-08-07): Model-Rollen-Accounts (nur zum
      // Content-Hochladen da) tauchten hier als Zeile mit $0 auf - gleicher
      // Fehler wie vorhin bei der Dashboard-Rangliste.
      const staffProfiles = profiles.filter((p) => p.role !== "model");
      const erlaubteProfile = isAdmin
        ? staffProfiles.filter(p => p.user_id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4")
        : staffProfiles.filter(p => p.user_id === currentUserId);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, isAdmin, monthOffset]);

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

  if (loading) return <div className="text-center pt-24 font-bold text-[#C9A86A] animate-pulse">Lade Abrechnungsdaten...</div>;

  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen bg-[#0A0A0A] text-[#E2C48A] rounded-2xl my-6 border border-white/5 shadow-2xl">
      <div className="mb-6 border-b border-white/5 pb-4">
        <h1 className="text-2xl font-black uppercase tracking-wider">
          {isAdmin && <span>💰</span>}{" "}
          <span className="bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent">
            {isAdmin ? "ET Agency Abrechnungs-Zentrale" : "Deine Abrechnung & Auszahlungsdaten"}
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">Übersicht deiner Einnahmen, Schichtstunden und Provisionsberechnungen</p>
      </div>

      <div className="flex items-center justify-between mb-6 bg-black/40 p-3 rounded-xl border border-[#9C7A3D]/10">
        <span className="text-sm font-bold text-[#C9A86A]">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonthOffset((o) => o + 1)} title="Vorheriger Monat" className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-[#E2C48A] hover:border-[#C9A86A]/40">←</button>
          <button onClick={() => setMonthOffset((o) => Math.max(0, o - 1))} disabled={monthOffset === 0} title="Nächster Monat" className="w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-[#E2C48A] hover:border-[#C9A86A]/40 disabled:opacity-30">→</button>
        </div>
      </div>

      {!isAdmin && (
        <section className="mb-8 bg-black/50 p-5 rounded-xl border border-[#9C7A3D]/20 shadow-xl">
          <h2 className="text-xs font-black text-[#C9A86A] uppercase tracking-widest mb-4"><span>📝</span> <span>Deine Zahlungsdaten hinterlegen</span></h2>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Adresse</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" placeholder="Straße, PLZ, Ort" className="w-full h-16 bg-black border border-[#9C7A3D]/20 rounded p-2 text-white outline-none focus:border-[#C9A86A]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">IBAN</label>
                <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} autoComplete="off" placeholder="DE..." className="w-full bg-black border border-[#9C7A3D]/20 rounded p-2 text-white outline-none focus:border-[#C9A86A]" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Crypto Netz</label>
                <input type="text" value={cryptoNetwork} onChange={(e) => setCryptoNetwork(e.target.value)} autoComplete="off" placeholder="z.B. TRC20" className="w-full bg-black border border-[#9C7A3D]/20 rounded p-2 text-white outline-none focus:border-[#C9A86A]" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Crypto Wallet</label>
              <input type="text" value={cryptoWallet} onChange={(e) => setCryptoWallet(e.target.value)} autoComplete="off" placeholder="Wallet Adresse..." className="w-full bg-black border border-[#9C7A3D]/20 rounded p-2 text-white outline-none focus:border-[#C9A86A]" />
            </div>
            <button onClick={handleSaveProfile} className="w-full bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black text-xs font-bold px-3 py-2 rounded uppercase cursor-pointer"><span>💾</span> Daten speichern</button>
            {saveStatus && <div className="text-center text-xs font-mono text-emerald-400">{saveStatus}</div>}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {abrechnungsDaten.map((daten, idx) => (
          <div key={idx} className="bg-black/40 p-5 rounded-xl border border-[#9C7A3D]/10 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-white">{daten.name}</h2>
              {daten.role === "moderator" ? (
                <span className="bg-[#9C7A3D]/10 border border-[#9C7A3D]/30 text-[#C9A86A] text-[10px] font-mono px-2 py-0.5 rounded">💰 EUR {daten.hourlyRate.toFixed(2)}/h</span>
              ) : (
                <span className="bg-[#9C7A3D]/10 border border-[#9C7A3D]/30 text-[#C9A86A] text-[10px] font-mono px-2 py-0.5 rounded">{daten.rate}% Provision</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#050505]/60 p-2 rounded border border-[#9C7A3D]/10">
                <div className="text-slate-400 font-bold text-[10px] mb-1">STUNDEN</div>
                <div className="font-mono font-bold text-[#C9A86A]">{daten.hours.toFixed(2)}h</div>
              </div>
              
              {daten.role === "moderator" ? (
                <>
                  <div className="bg-[#050505]/60 p-2 rounded border border-[#9C7A3D]/20">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">💰 STUNDENHONORAR</div>
                    <div className="font-mono font-bold text-[#C9A86A]">${(daten.hourlyRate * daten.hours).toFixed(2)}</div>
                  </div>
                  <div className="bg-[#050505]/60 p-2 rounded border border-[#E5C158]/20">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">🎁 PRÄMIE</div>
                    <div className="font-mono font-bold text-[#E5C158]">${daten.praemie.toFixed(2)}</div>
                  </div>
                  <div className="bg-[#050505]/60 p-2 rounded border border-emerald-500/20">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">💵 AUSZAHLUNG</div>
                    <div className="font-mono font-bold text-emerald-300">${daten.auszahlungStripchat.toFixed(2)}</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-[#050505]/60 p-2 rounded border border-[#9C7A3D]/10">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">BRUTTO</div>
                    <div className="font-mono font-bold text-white">${daten.brutto.toFixed(2)}</div>
                  </div>
                  <div className="bg-[#050505]/60 p-2 rounded border border-[#9C7A3D]/10">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">NETTO</div>
                    <div className="font-mono font-bold text-emerald-400">${daten.netto.toFixed(2)}</div>
                  </div>
                  <div className="bg-[#050505]/60 p-2 rounded border border-[#9C7A3D]/10">
                    <div className="text-slate-400 font-bold text-[10px] mb-1">AUSZAHLUNG ({daten.rate}%)</div>
                    <div className="font-mono font-bold text-[#E2C48A]">${daten.auszahlung.toFixed(2)}</div>
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
