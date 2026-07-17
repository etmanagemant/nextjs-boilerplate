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
    <div className="mb-6 p-6 bg-gradient-to-r from-[#D4AF37]/5 to-[#8B7500]/5 border border-[#D4AF37]/20 rounded-xl shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-black text-[#D4AF37] uppercase tracking-widest">
          📅 Deine nächsten 2 Schichten
        </h2>
        <p className="text-xs text-slate-400">Vergiss nicht dich einzustechen!</p>
      </div>

      {naechsteZweiSchichten.length === 0 ? (
        <div className="text-center py-4 text-slate-400">
          <p className="text-sm mb-2">✨ Keine Schichten geplant</p>
          <Link
            href="/content-plan"
            className="text-xs text-[#D4AF37] hover:text-[#F3E5AB] underline"
          >
            Im Kalender neue Schicht hinzufügen
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {naechsteZweiSchichten.map((shift, idx) => (
          <div key={shift.id} className="bg-black/40 border border-[#AA7C11]/20 rounded-lg p-4 hover:border-[#D4AF37]/40 transition">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-1">Schicht {idx + 1}</div>
                <div className="text-sm font-black text-[#F3E5AB]">
                  📆 {new Date(shift.datum).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 mb-1">Model</div>
                <div className="text-sm font-bold text-[#D4AF37]">{shift.model}</div>
              </div>
            </div>

            <div className="pb-3 mb-3 border-b border-[#AA7C11]/10">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-300">
                  ⏰ {shift.von} - {shift.bis} Uhr
                </div>
              </div>
            </div>

            {shift.nachricht && (
              <p className="text-xs text-slate-300 italic mb-3 bg-[#050505]/60 p-2 rounded border border-[#AA7C11]/5">
                "{shift.nachricht}"
              </p>
            )}

            <Link
              href="/chatter"
              className="inline-block w-full text-center bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold py-2 px-3 rounded text-xs uppercase tracking-wider transition"
            >
              ✓ Zu Stechuhr & einchecken
            </Link>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}
