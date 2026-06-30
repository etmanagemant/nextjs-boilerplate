"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type ModeratorStriptchatShiftProps = {
  currentUserId: string;
  currentUserFullName: string;
  sichereModels: any[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const calc = () => {
      setSeconds(
        Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
      );
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return (
    <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded ml-2">
      ⏱️ {pad2(hrs)}:{pad2(mins)}:{pad2(secs)}
    </span>
  );
}

function PrivateShowTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const calc = () => {
      setSeconds(
        Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
      );
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return (
    <span className="text-purple-400 font-mono font-bold bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded ml-2">
      🎭 {pad2(hrs)}:{pad2(mins)}:{pad2(secs)}
    </span>
  );
}

export default function ModeratorStriptchatShift({
  currentUserId,
  currentUserFullName,
  sichereModels,
}: ModeratorStriptchatShiftProps) {
  const supabase = createClient();
  const router = useRouter();

  const [shiftState, setShiftState] = useState<{
    shiftId: number | null;
    startedAt: string | null;
    selectedModelIds: number[];
    selectedModelNames: string[];
  } | null>(null);

  const [privateShowState, setPrivateShowState] = useState<{
    startedAt: string | null;
    totalHours: number;
  }>({ startedAt: null, totalHours: 0 });

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Multi-Model Selection
  const [selectedModelIds, setSelectedModelIds] = useState<number[]>([]);
  const [modelLifetimeStarts, setModelLifetimeStarts] = useState<Record<number, string>>({});
  const [modelLifetimeEnds, setModelLifetimeEnds] = useState<Record<number, string>>({});
  
  const [totalPrivateShowCount, setTotalPrivateShowCount] = useState(0);

  // Lade laufende Schicht beim Start
  useEffect(() => {
    loadActiveShift();
  }, []);

  async function loadActiveShift() {
    try {
      const { data: assignments } = await supabase
        .from("shift_assignments")
        .select("*")
        .eq("chatter_id", currentUserId)
        .is("ended_at", null);

      // Berechne totalPrivateShowCount für Prämien-Anzeige
      let totalCount = 0;
      const { data: allAssignments } = await supabase
        .from("shift_assignments")
        .select("privateshow_count")
        .eq("chatter_id", currentUserId);
      
      if (allAssignments) {
        totalCount = allAssignments.reduce((sum, a) => sum + (a.privateshow_count || 0), 0);
      }
      setTotalPrivateShowCount(totalCount);

      if (assignments && assignments.length > 0) {
        const active = assignments[0];
        let parsedNotes = { models: [] as any[] };
        try {
          if (active.notes && active.notes.startsWith("{")) {
            parsedNotes = JSON.parse(active.notes);
          }
        } catch (e) {}

        const modelIds = parsedNotes.models?.map((m: any) => m.id) || [];
        const modelNames = parsedNotes.models?.map((m: any) => m.name) || [];

        setShiftState({
          shiftId: active.id,
          startedAt: active.started_at,
          selectedModelIds: modelIds,
          selectedModelNames: modelNames,
        });

        // Lade Privat-Show-Daten
        if (active.privateshow_total_hours) {
          setPrivateShowState({
            startedAt: null,
            totalHours: active.privateshow_total_hours,
          });
        }
      }
      setLoading(false);
    } catch (err) {
      console.error("Error loading active shift:", err);
      setLoading(false);
    }
  }

  // ==========================================
  // SHIFT START
  // ==========================================
  async function handleStartShift() {
    if (selectedModelIds.length === 0) {
      setMessage({
        type: "error",
        text: "⚠️ Bitte mindestens ein Model auswählen",
      });
      return;
    }

    // Kontrolliere ob für jedes Model ein Lifetime-Start eingegeben wurde
    for (const modelId of selectedModelIds) {
      if (!modelLifetimeStarts[modelId] || modelLifetimeStarts[modelId] === "") {
        const modelName = sichereModels.find(m => m.id === modelId)?.name || "Model";
        setMessage({
          type: "error",
          text: `⚠️ Bitte Stripchat Lifetime-Umsatz für ${modelName} eingeben`,
        });
        return;
      }
      
      const value = parseFloat(modelLifetimeStarts[modelId]);
      if (isNaN(value) || value < 0) {
        setMessage({
          type: "error",
          text: "⚠️ Bitte gültige Umsatzwerte eingeben",
        });
        return;
      }
    }

    try {
      // Speichere ausgewählte Models mit ihren Start-Werten
      const selectedModelsData = selectedModelIds.map(id => {
        const model = sichereModels.find(m => m.id === id);
        return {
          id: id,
          name: model?.name || "Unknown",
          lifetime_start: parseFloat(modelLifetimeStarts[id]),
        };
      });

      const notes = JSON.stringify({
        models: selectedModelsData,
      });

      const { data, error } = await supabase.from("shift_assignments").insert([
        {
          chatter_id: currentUserId,
          started_at: new Date().toISOString(),
          notes: notes,
        },
      ]).select();

      if (error) throw error;

      const newShift = data?.[0];
      if (newShift) {
        setShiftState({
          shiftId: newShift.id,
          startedAt: newShift.started_at,
          selectedModelIds: selectedModelIds,
          selectedModelNames: selectedModelIds.map(id => sichereModels.find(m => m.id === id)?.name || ""),
        });
        
        // Reset inputs
        setModelLifetimeStarts({});
        setSelectedModelIds([]);
        
        setMessage({
          type: "success",
          text: `✅ Schicht gestartet mit ${selectedModelIds.length} Model(s)!`,
        });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: `⚠️ Fehler beim Starten: ${err.message}`,
      });
    }
  }

  // ==========================================
  // PRIVATE SHOW START/END
  // ==========================================
  async function handleTogglePrivateShow() {
    if (!shiftState) return;

    if (privateShowState.startedAt) {
      // END private show
      const start = new Date(privateShowState.startedAt).getTime();
      const end = Date.now();
      const durationMs = end - start;
      const durationMinutes = durationMs / (1000 * 60);
      const hours = durationMs / (1000 * 60 * 60);
      
      // 🎯 5 MINUTEN REGEL: Show muss mindestens 5 Min sein um zu zählen
      const countsForPremium = durationMinutes >= 5;
      const newTotal = privateShowState.totalHours + hours;

      try {
        // 🔄 Aktualisiere shift_assignments mit neuen Werten
        const updateData: any = { privateshow_total_hours: newTotal };
        
        // Wenn Show >= 5 Min, erhöhe den Count für Prämien-Berechnung
        if (countsForPremium) {
          const { data: currentShift } = await supabase
            .from("shift_assignments")
            .select("privateshow_count")
            .eq("id", shiftState.shiftId)
            .maybeSingle();
          
          updateData.privateshow_count = (currentShift?.privateshow_count || 0) + 1;
          // Aktualisiere auch den lokalen Count
          setTotalPrivateShowCount(totalPrivateShowCount + 1);
        }
        
        const { error } = await supabase
          .from("shift_assignments")
          .update(updateData)
          .eq("id", shiftState.shiftId);

        if (error) throw error;

        setPrivateShowState({
          startedAt: null,
          totalHours: newTotal,
        });

        if (countsForPremium) {
          setMessage({
            type: "success",
            text: `✅ Privat-Show gezählt! +${hours.toFixed(2)}h (${durationMinutes.toFixed(0)} min) | Total: ${newTotal.toFixed(2)}h`,
          });
        } else {
          setMessage({
            type: "success",
            text: `⏱️ Show war nur ${durationMinutes.toFixed(0)} min - zu kurz! Mindestens 5 Min erforderlich.`,
          });
        }
        setTimeout(() => setMessage(null), 3000);
      } catch (err: any) {
        setMessage({
          type: "error",
          text: `⚠️ Fehler: ${err.message}`,
        });
      }
    } else {
      // START private show
      setPrivateShowState({
        startedAt: new Date().toISOString(),
        totalHours: privateShowState.totalHours,
      });
      setMessage({
        type: "success",
        text: "🎭 Privat-Show gestartet!",
      });
      setTimeout(() => setMessage(null), 2000);
    }
  }

  // ==========================================
  // SHIFT END
  // ==========================================
  async function handleEndShift() {
    if (!shiftState) return;

    // Kontrolliere ob für jedes Model ein Lifetime-End eingegeben wurde
    for (const modelId of shiftState.selectedModelIds) {
      if (!modelLifetimeEnds[modelId] || modelLifetimeEnds[modelId] === "") {
        const modelName = shiftState.selectedModelNames[shiftState.selectedModelIds.indexOf(modelId)];
        setMessage({
          type: "error",
          text: `⚠️ Bitte Stripchat Lifetime-Umsatz nach Schichtende für ${modelName} eingeben`,
        });
        return;
      }
      
      const value = parseFloat(modelLifetimeEnds[modelId]);
      if (isNaN(value) || value < 0) {
        setMessage({
          type: "error",
          text: "⚠️ Bitte gültige Umsatzwerte eingeben",
        });
        return;
      }
    }

    try {
      // Beende Shift
      const { error: endError } = await supabase
        .from("shift_assignments")
        .update({
          ended_at: new Date().toISOString(),
        })
        .eq("id", shiftState.shiftId);

      if (endError) throw endError;

      // Erstelle Revenue-Einträge für JEDES ausgewählte Model
      let totalRevenue = 0;
      for (const modelId of shiftState.selectedModelIds) {
        const lifetimeStart = parseFloat(
          Object.values(modelLifetimeStarts).find(() => true) || "0"
        ); // Hole aus Shift-State
        const lifetimeEnd = parseFloat(modelLifetimeEnds[modelId]);
        const revenueDifference = lifetimeEnd - lifetimeStart;
        totalRevenue += revenueDifference;

        if (revenueDifference > 0) {
          const gross = revenueDifference;
          const net = gross * 0.8; // 80% nach Plattformgebühr

          const { error: revenueError } = await supabase
            .from("chatter_revenues")
            .insert([
              {
                user_id: currentUserId,
                model_id: modelId,
                gross_amount: gross,
                amount: net,
                platform: "stripchat",
                created_at: new Date().toISOString(),
              },
            ]);

          if (revenueError) {
            console.error("Revenue insert error:", revenueError);
          }
        }
      }

      setShiftState(null);
      setPrivateShowState({ startedAt: null, totalHours: 0 });
      setModelLifetimeEnds({});
      setMessage({
        type: "success",
        text: `✅ Schicht beendet! Umsatz: $${totalRevenue.toFixed(2)} über ${shiftState.selectedModelIds.length} Model(s)`,
      });

      router.refresh();
      setTimeout(() => {
        setMessage(null);
        loadActiveShift();
      }, 3000);
    } catch (err: any) {
      setMessage({
        type: "error",
        text: `⚠️ Fehler beim Beenden: ${err.message}`,
      });
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400 animate-pulse font-bold">
        Lade Schichtdaten...
      </div>
    );
  }

  if (!shiftState) {
    // SHIFT NOT ACTIVE - Model Selection mit Checkboxes
    return (
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg space-y-4">
        <h2 className="text-sm font-bold text-[#D4AF37] uppercase tracking-wider">
          🎭 Stripchat Schicht starten
        </h2>

        <div className="space-y-3">
          {/* Model Selection mit Checkboxes */}
          <div>
            <label className="block text-xs font-semibold text-[#D4AF37] mb-2">
              Models auswählen (mehrere möglich)
            </label>
            <div className="bg-[#050505] border border-[#AA7C11]/30 rounded p-3 space-y-2">
              {sichereModels.length > 0 ? (
                sichereModels.map((model) => (
                  <label key={model.id} className="flex items-center gap-2 cursor-pointer hover:bg-[#1a1a1a] p-2 rounded transition">
                    <input
                      type="checkbox"
                      checked={selectedModelIds.includes(model.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedModelIds([...selectedModelIds, model.id]);
                        } else {
                          setSelectedModelIds(selectedModelIds.filter(id => id !== model.id));
                          const newStarts = { ...modelLifetimeStarts };
                          delete newStarts[model.id];
                          setModelLifetimeStarts(newStarts);
                        }
                      }}
                      className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                    />
                    <span className="text-white text-sm">{model.name}</span>
                  </label>
                ))
              ) : (
                <div className="text-slate-400 text-xs">Keine Stripchat-Models verfügbar</div>
              )}
            </div>
          </div>

          {/* Lifetime-Start Inputs für ausgewählte Models */}
          {selectedModelIds.length > 0 && (
            <div className="space-y-2 border-t border-[#AA7C11]/20 pt-3">
              <label className="block text-xs font-semibold text-[#D4AF37] mb-1">
                Stripchat Lifetime-Umsatz VOR Schichtbeginn ($)
              </label>
              {selectedModelIds.map((modelId) => {
                const model = sichereModels.find(m => m.id === modelId);
                return (
                  <div key={modelId} className="flex items-center gap-2">
                    <span className="text-white text-xs min-w-20">{model?.name}:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={modelLifetimeStarts[modelId] || ""}
                      onChange={(e) =>
                        setModelLifetimeStarts({
                          ...modelLifetimeStarts,
                          [modelId]: e.target.value,
                        })
                      }
                      placeholder="z.B. 1250.50"
                      className="flex-1 px-3 py-1.5 bg-[#050505] border border-[#AA7C11]/30 rounded text-white text-xs focus:border-[#D4AF37] outline-none"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={handleStartShift}
            className="w-full bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-2 rounded text-sm transition cursor-pointer"
          >
            ✅ Schicht starten
          </button>
        </div>

        {message && (
          <div
            className={`p-3 rounded text-xs font-bold text-center ${
              message.type === "success"
                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                : "bg-red-600/20 text-red-400 border border-red-500/30"
            }`}
          >
            {message.text}
          </div>
        )}
      </section>
    );
  }

  // SHIFT ACTIVE
  return (
    <section className="bg-black/40 p-6 rounded-xl border border-emerald-500/30 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
          🟢 Schicht aktiv - {shiftState.selectedModelNames.join(", ")}
        </h2>
        <LiveTimer startedAt={shiftState.startedAt!} />
      </div>

      {/* 🎁 PRÄMIEN-FORTSCHRITT */}
      <div className="grid grid-cols-3 gap-2">
        {/* 15 Shows = 30€ */}
        <div className={`p-3 rounded border transition ${
          totalPrivateShowCount >= 15
            ? "bg-emerald-600/30 border-emerald-500/50"
            : "bg-slate-900/30 border-slate-700/30"
        }`}>
          <div className="text-xs font-bold text-emerald-400 mb-1">15 Shows</div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-1">
            <div
              className={`h-full transition-all ${totalPrivateShowCount >= 15 ? "bg-emerald-500" : "bg-slate-600"}`}
              style={{ width: `${Math.min(100, (totalPrivateShowCount / 15) * 100)}%` }}
            />
          </div>
          <div className="text-xs text-slate-400">{totalPrivateShowCount}/15</div>
          <div className="text-[10px] font-bold text-emerald-400 mt-1">💰 30€</div>
          {totalPrivateShowCount >= 15 && <div className="text-[10px] font-bold text-emerald-400">✅ FREIGESCHALTEN!</div>}
        </div>

        {/* 20 Shows = 50€ */}
        <div className={`p-3 rounded border transition ${
          totalPrivateShowCount >= 20
            ? "bg-blue-600/30 border-blue-500/50"
            : "bg-slate-900/30 border-slate-700/30"
        }`}>
          <div className="text-xs font-bold text-blue-400 mb-1">20 Shows</div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-1">
            <div
              className={`h-full transition-all ${totalPrivateShowCount >= 20 ? "bg-blue-500" : "bg-slate-600"}`}
              style={{ width: `${Math.min(100, (totalPrivateShowCount / 20) * 100)}%` }}
            />
          </div>
          <div className="text-xs text-slate-400">{totalPrivateShowCount}/20</div>
          <div className="text-[10px] font-bold text-blue-400 mt-1">💰 50€</div>
          {totalPrivateShowCount >= 20 && <div className="text-[10px] font-bold text-blue-400">✅ FREIGESCHALTEN!</div>}
        </div>

        {/* 25 Shows = 70€ */}
        <div className={`p-3 rounded border transition ${
          totalPrivateShowCount >= 25
            ? "bg-purple-600/30 border-purple-500/50"
            : "bg-slate-900/30 border-slate-700/30"
        }`}>
          <div className="text-xs font-bold text-purple-400 mb-1">25 Shows</div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-1">
            <div
              className={`h-full transition-all ${totalPrivateShowCount >= 25 ? "bg-purple-500" : "bg-slate-600"}`}
              style={{ width: `${Math.min(100, (totalPrivateShowCount / 25) * 100)}%` }}
            />
          </div>
          <div className="text-xs text-slate-400">{totalPrivateShowCount}/25</div>
          <div className="text-[10px] font-bold text-purple-400 mt-1">💰 70€ 🏆</div>
          {totalPrivateShowCount >= 25 && <div className="text-[10px] font-bold text-purple-400">✅ FREIGESCHALTEN!</div>}
        </div>
      </div>

      {/* Private Show Section */}
      <div className="bg-purple-950/20 border border-purple-500/20 rounded p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-purple-300">
            Privat-Shows: {privateShowState.totalHours.toFixed(2)}h
          </span>
          {privateShowState.startedAt && (
            <PrivateShowTimer startedAt={privateShowState.startedAt} />
          )}
        </div>

        <button
          onClick={handleTogglePrivateShow}
          className={`w-full font-bold py-2 rounded text-sm transition cursor-pointer ${
            privateShowState.startedAt
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}
        >
          {privateShowState.startedAt ? "🎭 Privat-Show beenden" : "🎭 Privat-Show starten"}
        </button>
      </div>

      {/* Shift End Section - Pro Model ein Input-Feld */}
      <div className="space-y-3 border-t border-[#AA7C11]/10 pt-4">
        <label className="block text-xs font-semibold text-[#D4AF37]">
          Stripchat Lifetime-Umsatz NACH Schichtende ($) - Pro Model
        </label>
        
        {shiftState.selectedModelIds.map((modelId, idx) => {
          const modelName = shiftState.selectedModelNames[idx];
          return (
            <div key={modelId} className="flex items-center gap-2">
              <span className="text-white text-xs min-w-24 font-semibold">{modelName}:</span>
              <input
                type="number"
                step="0.01"
                value={modelLifetimeEnds[modelId] || ""}
                onChange={(e) =>
                  setModelLifetimeEnds({
                    ...modelLifetimeEnds,
                    [modelId]: e.target.value,
                  })
                }
                placeholder="z.B. 1350.75"
                className="flex-1 px-3 py-2 bg-[#050505] border border-[#AA7C11]/30 rounded text-white text-sm focus:border-[#D4AF37] outline-none"
              />
            </div>
          );
        })}

        <button
          onClick={handleEndShift}
          className="w-full bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-2 rounded text-sm transition cursor-pointer"
        >
          ⏹️ Schicht beenden
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded text-xs font-bold text-center ${
            message.type === "success"
              ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
              : "bg-red-600/20 text-red-400 border border-red-500/30"
          }`}
        >
          {message.text}
        </div>
      )}
    </section>
  );
}
