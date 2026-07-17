"use client";

import { useState, useEffect } from "react";

interface Shift {
  id: string;
  modelName: string;
  date: string;
  startTime: string;
  endTime: string;
  platform: string;
  hourlyRate: number;
}

interface NextShiftsViewProps {
  modelId?: string;
  modelName?: string;
  onOpenOnlyFans?: (modelId: string) => void;
}

/**
 * NextShiftsView - Landing page showing next 2 scheduled shifts
 * Like a weekly calendar with shift schedule and clock-in reminder
 */
export function NextShiftsView({
  modelId,
  modelName = "Model",
  onOpenOnlyFans,
}: NextShiftsViewProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasClocked, setHasClocked] = useState(false);

  // Mock data - in production, fetch from API
  useEffect(() => {
    // Simulate fetching shifts
    const mockShifts: Shift[] = [
      {
        id: "1",
        modelName: modelName,
        date: new Date(Date.now() + 86400000).toLocaleDateString("de-DE"),
        startTime: "14:00",
        endTime: "18:00",
        platform: "OnlyFans",
        hourlyRate: 15,
      },
      {
        id: "2",
        modelName: modelName,
        date: new Date(Date.now() + 172800000).toLocaleDateString("de-DE"),
        startTime: "10:00",
        endTime: "14:00",
        platform: "OnlyFans",
        hourlyRate: 15,
      },
    ];

    setTimeout(() => {
      setShifts(mockShifts);
      setIsLoading(false);
    }, 300);
  }, [modelName]);

  const handleClock = () => {
    setHasClocked(true);
    console.log("[SHIFTS] Clocked in at", new Date().toLocaleTimeString("de-DE"));
    // In production: POST to /api/time-tracking/clock-in
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
          <p className="text-slate-400 mt-4">Lade Schichten...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gradient-to-br from-[#0A0A0A] via-black to-[#1A0A0A] overflow-y-auto">
      {/* HEADER */}
      <div className="sticky top-0 bg-black/50 backdrop-blur border-b border-[#D4AF37]/20 p-6 z-20">
        <h1 className="text-3xl font-black text-[#D4AF37] mb-2 uppercase tracking-widest">
          📅 Deine nächsten 2 Schichten
        </h1>
        <p className="text-slate-400 text-sm">
          Vergiss nicht dich einzustechen, damit du deine Einnahmen korrekt erfasst!
        </p>
      </div>

      {/* CONTENT */}
      <div className="p-6 space-y-6">
        {/* SHIFTS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {shifts.map((shift, idx) => (
            <div
              key={shift.id}
              className="bg-gradient-to-br from-[#1A1A1A] to-[#0F0F0F] border border-[#D4AF37]/30 rounded-xl p-6 hover:border-[#D4AF37]/60 transition-all duration-300 shadow-2xl"
            >
              {/* SHIFT NUMBER */}
              <div className="text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-3">
                Schicht {idx + 1}
              </div>

              {/* DATE & TIME */}
              <div className="mb-4">
                <div className="text-2xl font-black text-[#F3E5AB] mb-2">
                  📆 {shift.date}
                </div>
                <div className="text-lg font-bold text-slate-300">
                  ⏰ {shift.startTime} - {shift.endTime}
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  Dauer: {(() => {
                    const [startH, startM] = shift.startTime.split(":").map(Number);
                    const [endH, endM] = shift.endTime.split(":").map(Number);
                    const hours =
                      endH -
                      startH -
                      (endM < startM ? 1 : 0) +
                      (endM < startM ? 60 - startM + endM : endM - startM) / 60;
                    return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}min`;
                  })()}
                </div>
              </div>

              {/* PLATFORM & RATE */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#D4AF37]/20">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Plattform
                  </div>
                  <div className="text-sm font-bold text-[#F3E5AB]">{shift.platform}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Stundensatz
                  </div>
                  <div className="text-sm font-bold text-[#D4AF37]">€{shift.hourlyRate}/h</div>
                </div>
              </div>

              {/* OPEN ONLYFANS BUTTON */}
              {idx === 0 && modelId && (
                <button
                  onClick={() => {
                    if (onOpenOnlyFans) {
                      onOpenOnlyFans(modelId);
                    }
                  }}
                  className="w-full bg-gradient-to-r from-[#D4AF37]/80 to-[#F3E5AB]/80 hover:from-[#D4AF37] hover:to-[#F3E5AB] text-black font-bold py-2 px-4 rounded-lg transition-all duration-300 uppercase tracking-wider text-sm"
                >
                  🌐 Zu OnlyFans Profil
                </button>
              )}
            </div>
          ))}
        </div>

        {/* CLOCK-IN SECTION */}
        <div className="mt-8 p-6 bg-gradient-to-r from-[#D4AF37]/10 to-[#8B7500]/10 border border-[#D4AF37]/40 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black text-[#F3E5AB] uppercase tracking-widest">
                ⏱️ Stechuhr
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Vergiss nicht, dich einzustechen, bevor du deine Schicht startest!
              </p>
            </div>
            <div>
              {hasClocked ? (
                <div className="text-right">
                  <div className="text-xs font-bold text-green-400 uppercase tracking-widest">
                    ✅ Eingecheckt
                  </div>
                  <div className="text-lg font-black text-green-400">
                    {new Date().toLocaleTimeString("de-DE")}
                  </div>
                </div>
              ) : (
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Status: Nicht eingecheckt
                  </div>
                </div>
              )}
            </div>
          </div>

          {!hasClocked ? (
            <button
              onClick={handleClock}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 uppercase tracking-wider text-lg shadow-lg"
            >
              ✓ Jetzt einchecken
            </button>
          ) : (
            <button
              onClick={() => setHasClocked(false)}
              className="w-full bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 uppercase tracking-wider text-lg"
            >
              ✗ Auschecken
            </button>
          )}
        </div>

        {/* TIPS SECTION */}
        <div className="p-4 bg-[#1A1A1A]/50 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-slate-400">
            💡 <strong>Tipp:</strong> Deine Schichten werden automatisch synchronisiert. Stelle sicher, dass
            du dich rechtzeitig eincheckst, damit deine Einnahmen korrekt erfasst werden!
          </p>
        </div>
      </div>
    </div>
  );
}
