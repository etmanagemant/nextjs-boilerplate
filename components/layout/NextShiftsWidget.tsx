"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";

interface Shift {
  id: number;
  shift_date: string;
  notes: string;
}

interface NextShiftsWidgetProps {
  allShifts: Shift[];
  userEmail: string;
  userId: string;
  userFullName?: string;
  isAdmin?: boolean;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function getHeuteISOString() {
  const d = new Date();
  const options = { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" } as const;
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export default function NextShiftsWidget({
  allShifts,
  userEmail,
  userId,
  userFullName,
  isAdmin = false,
}: NextShiftsWidgetProps) {
  const [jetztZeit, setJetztZeit] = useState("");

  useEffect(() => {
    const calcZeit = () => {
      const d = new Date();
      setJetztZeit(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
    };
    calcZeit();
    const interval = setInterval(calcZeit, 1000);
    return () => clearInterval(interval);
  }, []);

  // Parse shifts to get next 2 for this user
  const naechsteZweiSchichten = useMemo(() => {
    const heuteStr = getHeuteISOString();

    const userSchichten = allShifts
      .map((shift) => {
        try {
          let parsed = { mitarbeiter: "Mitarbeiter", von: "00:00", bis: "00:00", model: "Kein Model", nachricht: "" };
          if (shift.notes && shift.notes.startsWith("{")) {
            parsed = JSON.parse(shift.notes);
          } else {
            parsed.mitarbeiter = shift.notes || "Geplant";
          }

          const kalenderMitarbeiter = String(parsed.mitarbeiter).toLowerCase().trim();
          const matchtMitarbeiter =
            kalenderMitarbeiter === userEmail.toLowerCase().trim() ||
            kalenderMitarbeiter === userId.trim() ||
            (userFullName && kalenderMitarbeiter === userFullName.toLowerCase().trim());

          if (matchtMitarbeiter) {
            return {
              id: shift.id,
              datum: shift.shift_date || "",
              von: parsed.von || "00:00",
              bis: parsed.bis || "00:00",
              model: parsed.model || "Kein Model",
              nachricht: parsed.nachricht || "",
            };
          }
          return null;
        } catch (e) {
          return null;
        }
      })
      .filter((s) => s !== null);

    // Filter to future shifts
    const zukuenftige = userSchichten.filter((s) => {
      if (s.datum > heuteStr) return true;
      if (s.datum === heuteStr) {
        return s.bis > jetztZeit;
      }
      return false;
    });

    return zukuenftige.sort((a, b) => `${a.datum}T${a.von}`.localeCompare(`${b.datum}T${b.von}`)).slice(0, 2);
  }, [allShifts, userEmail, userId, userFullName, jetztZeit]);

  // Show widget even if no upcoming shifts (just with different message)
  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* REMINDER BOX - PROMINENT */}
      <div className="mb-6 p-5 bg-gradient-to-r from-[#C9A86A]/15 to-[#9C7A3D]/10 border-2 border-[#C9A86A]/50 rounded-xl shadow-2xl relative overflow-hidden">
        {/* Animated background effect - subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#C9A86A]/5 via-transparent to-[#9C7A3D]/5 opacity-50 pointer-events-none"></div>
        
        <div className="relative z-10 flex items-center justify-center text-center gap-3">
          <span className="text-3xl animate-bounce">🔔</span>
          <div>
            <p className="text-lg font-black text-[#C9A86A] uppercase tracking-widest">
              Vergiss nicht dich einzustechen!
            </p>
            <p className="text-xs text-[#E2C48A] font-bold mt-1">Stechuhr vor Schichtbeginn kontrollieren</p>
          </div>
        </div>
      </div>

      {/* SHIFTS WIDGET */}
      <div className="mb-6 p-6 bg-gradient-to-br from-[#C9A86A]/8 to-[#8B7500]/5 border-2 border-[#C9A86A]/30 rounded-xl shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#C9A86A]/20">
          <h2 className="text-xl font-black text-[#C9A86A] uppercase tracking-widest">
            📅 Deine nächsten 2 Schichten
          </h2>
          <div className="text-xs px-3 py-1 bg-[#C9A86A]/20 text-[#E2C48A] rounded-full font-bold">
            {naechsteZweiSchichten.length > 0 ? naechsteZweiSchichten.length : 0} geplant
          </div>
        </div>

      {naechsteZweiSchichten.length === 0 ? (
        <div className="text-center py-8 px-6 bg-gradient-to-br from-[#0A0A0A] to-[#050505] border border-[#9C7A3D]/20 rounded-lg">
          <p className="text-lg mb-3">✨ Keine Schichten geplant</p>
          {isAdmin && (
            <>
              <p className="text-xs text-slate-400 mb-4">Erstelle eine neue Schicht im Management</p>
              <Link
                href="/management"
                className="inline-block px-6 py-2 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg text-xs uppercase tracking-wider transition-all hover:shadow-lg"
              >
                ⚙️ Zum Management
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {naechsteZweiSchichten.map((shift, idx) => (
          <div key={shift.id} className="group relative bg-gradient-to-br from-[#1A1A0E] to-[#0A0A00] border-2 border-[#C9A86A]/30 rounded-lg p-5 hover:border-[#C9A86A]/70 hover:shadow-2xl hover:shadow-[#C9A86A]/20 transition-all duration-300 transform hover:scale-105">
            {/* Card Number Badge */}
            <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-br from-[#C9A86A] to-[#9C7A3D] rounded-bl-lg flex items-center justify-center text-black font-black text-lg opacity-90 group-hover:opacity-100">
              {idx + 1}
            </div>

            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs font-bold text-[#C9A86A] uppercase tracking-widest mb-2 opacity-80">📆 Schicht {idx + 1}</div>
                <div className="text-sm font-black text-[#E2C48A]">
                  {new Date(shift.datum).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
                </div>
              </div>
            </div>

            <div className="pb-4 mb-4 border-b border-[#C9A86A]/20">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-slate-300">
                  ⏰ {shift.von} - {shift.bis} Uhr
                </div>
                <span className="text-xs px-2 py-1 bg-[#C9A86A]/20 text-[#E2C48A] rounded font-bold">
                  {shift.model}
                </span>
              </div>
            </div>

            {shift.nachricht && (
              <p className="text-xs text-[#E2C48A] italic mb-4 bg-[#050505]/80 p-3 rounded-lg border border-[#C9A86A]/20 font-semibold">
                💬 <span className="font-bold">{shift.nachricht}</span>
              </p>
            )}

            <Link
              href="/chatter"
              className="w-full inline-block text-center bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-black py-3 px-3 rounded-lg text-xs uppercase tracking-wider transition-all transform hover:shadow-lg hover:shadow-[#C9A86A]/30 active:scale-95"
            >
              ✓ Zur Stechuhr → Einchecken
            </Link>
          </div>
        ))}
        </div>
      )}
      </div>
    </div>
  );
}
