"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type CreateShiftFormProps = {
  sichereProfile: any[];
  sichereModels: any[];
};

export default function CreateShiftForm({ sichereProfile, sichereModels }: CreateShiftFormProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  function handleCheckboxChange(modelName: string, isChecked: boolean) {
    if (isChecked) {
      setSelectedModels([...selectedModels, modelName]);
    } else {
      setSelectedModels(selectedModels.filter(name => name !== modelName));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    const formData = new FormData(e.currentTarget);
    const chatterId = formData.get("chatter_id") as string; 
    const dateStr = formData.get("date") as string; 
    const startTime = formData.get("start_time") as string; 
    const endTime = formData.get("end_time") as string;     

    if (!chatterId || !dateStr || !startTime || !endTime) {
      setStatusMsg({ type: "error", text: "⚠ Bitte alle Pflichtfelder ausfüllen." });
      setLoading(false);
      return;
    }

    const formatierterSlot = `${startTime} – ${endTime} Uhr`;

    try {
      if (selectedModels.length > 0) {
        const inserts = selectedModels.map(name => {
          const individuelleNachricht = formData.get(`mass_message_${name}`) as string;
          const details = `Mitarbeiter: ${chatterId} | Zeit: ${startTime} - ${endTime} | Model: ${name} | MESSAGE_START:${individuelleNachricht}:MESSAGE_END`;

          return {
            shift_date: dateStr,
            time_slot_id: 1, // 🟢 FIXED: Nutzt die garantiert existierende ID 1 der time_slots Tabelle!
            notes: details
          };
        });

        const { error } = await supabase.from("shifts").insert(inserts);
        if (error) throw error;
      } else {
        const details = `Mitarbeiter: ${chatterId} | Zeit: ${startTime} - ${endTime} | Kein Model`;

        const { error } = await supabase.from("shifts").insert([
          { shift_date: dateStr, time_slot_id: 1, notes: details } // 🟢 FIXED ALSO HERE
        ]);
        if (error) throw error;
      }

      setStatusMsg({ type: "success", text: "✓ Schicht(en) mit Mass Messages erfolgreich im Kalender angelegt!" });
      e.currentTarget.reset();
      setSelectedModels([]);
      router.refresh();

    } catch (dbError: any) {
      console.error(dbError);
      setStatusMsg({ type: "error", text: `⚠ Datenbank-Fehler: ${dbError.message || "Übertragung fehlgeschlagen"}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm text-white">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Mitarbeiter (Chatter) wählen</label>
          <select name="chatter_id" required className="w-full px-3 py-2 border border-slate-700 rounded-md text-white bg-slate-900 focus:outline-none">
            {sichereProfile.map(p => (
              <option key={p.user_id} value={p.full_name || p.email}>{p.full_name || p.email}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Datum</label>
          <input type="date" name="date" required className="w-full px-3 py-2 border border-slate-700 rounded-md text-white bg-slate-900 focus:outline-none" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">Models zuteilen (Mehrfachauswahl möglich)</label>
        <div className="grid grid-cols-2 gap-2 bg-slate-900 p-3 rounded-md border border-slate-700 max-h-[120px] overflow-y-auto">
          {sichereModels.map(m => (
            <label key={m.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white">
              <input 
                type="checkbox" 
                name="model_names" 
                value={m.name} 
                onChange={(e) => handleCheckboxChange(m.name, e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0" 
              />
              {m.name}
            </label>
          ))}
        </div>
      </div>

      {selectedModels.length > 0 && (
        <div className="space-y-3 bg-slate-900/60 p-4 rounded-md border border-slate-800">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mass Messages für ausgewählte Models eintragen:</h3>
          {selectedModels.map((modelName) => (
            <div key={modelName} className="space-y-1">
              <label className="block text-xs text-emerald-400 font-medium">Mass Message für {modelName}:</label>
              <textarea 
                name={`mass_message_${modelName}`} 
                placeholder={`Hier die Nachricht für {modelName} eintragen...`}
                required
                rows={2}
                className="w-full px-3 py-2 border border-slate-700 rounded-md text-white bg-slate-950 focus:outline-none focus:border-blue-500 text-xs resize-none"
              />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Schicht Anfang</label>
          <input type="time" name="start_time" required className="w-full px-3 py-2 border border-slate-700 rounded-md text-white bg-slate-900 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Schicht Ende</label>
          <input type="time" name="end_time" required className="w-full px-3 py-2 border border-slate-700 rounded-md text-white bg-slate-900 focus:outline-none" />
        </div>
      </div>

      {statusMsg && (
        <div className={`p-2 rounded text-sm font-medium text-center border ${
          statusMsg.type === "success" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {statusMsg.text}
        </div>
      )}

      <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer">
        {loading ? "Wird eingetragen..." : "Schichten & Nachrichten im Kalender eintragen"}
      </button>
    </form>
  );
}
