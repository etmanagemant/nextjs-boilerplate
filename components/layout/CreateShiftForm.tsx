"use client";

import { useState } from "react";
import { addShift } from "@/app/management/actions";

type CreateShiftFormProps = {
  sichereProfile: any[];
  sichereModels: any[];
};

export default function CreateShiftForm({ sichereProfile, sichereModels }: CreateShiftFormProps) {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    const formData = new FormData(e.currentTarget);
    
    try {
      await addShift(formData);
      // 🟢 RÜCKMELDUNG ERFOLGREICH:
      setStatusMsg({ type: "success", text: "✓ Schicht erfolgreich im Kalender angelegt!" });
      // Formular zurücksetzen außer Datum
      const form = e.currentTarget;
      form.reset();
    } catch (err) {
      setStatusMsg({ type: "error", text: "⚠ Fehler beim Anlegen der Schicht. Bitte erneut versuchen." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Mitarbeiter (Chatter) wählen</label>
        <select name="chatter_id" required className="w-full px-3 py-2 border border-slate-700 rounded-md text-sm text-white bg-slate-900">
          {sichereProfile.map(p => (
            <option key={p.user_id} value={p.user_id}>{p.full_name || "Mitarbeiter"} ({p.email})</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Model zuteilen</label>
        <select name="model_id" className="w-full px-3 py-2 border border-slate-700 rounded-md text-sm text-white bg-slate-900">
          <option value="">Kein Model</option>
          {sichereModels.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Datum</label>
        <input type="date" name="date" required className="w-full px-3 py-2 border border-slate-700 rounded-md text-sm text-white bg-slate-900" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Schicht Anfang</label>
          <input type="time" name="start_time" required className="w-full px-3 py-2 border border-slate-700 rounded-md text-sm text-white bg-slate-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Schicht Ende</label>
          <input type="time" name="end_time" required className="w-full px-3 py-2 border border-slate-700 rounded-md text-sm text-white bg-slate-900" />
        </div>
      </div>

      {statusMsg && (
        <div className={`sm:col-span-2 p-2 rounded text-sm font-medium text-center border ${
          statusMsg.type === "success" 
            ? "bg-green-500/10 border-green-500/30 text-green-400" 
            : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {statusMsg.text}
        </div>
      )}

      <div className="sm:col-span-2">
        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 transition cursor-pointer disabled:opacity-50"
        >
          {loading ? "Wird eingetragen..." : "Schicht im Kalender eintragen"}
        </button>
      </div>
    </form>
  );
}
