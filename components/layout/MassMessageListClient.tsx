"use client";

import { useState } from "react";
import { deleteMassMessage, updateMassMessage } from "@/app/massmessage/actions";

export default function MassMessageListClient({ nachrichten }: { nachrichten: any[] }) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  function handleCopy(text: string, id: number) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {nachrichten.map((n) => (
        <div key={n.id} className="bg-black/30 border border-[#AA7C11]/20 rounded-xl p-4 flex flex-col justify-between hover:border-[#D4AF37]/40 transition relative group">
          
          <div>
            <div className="flex justify-between items-center border-b border-[#AA7C11]/10 pb-2 mb-2">
              <span className="text-xs font-black text-[#D4AF37] uppercase tracking-wide">Model: {n.model_name}</span>
              <span className="text-[10px] text-slate-500 font-medium">{n.datum}</span>
              
              {/* Bearbeiten & Löschen */}
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => { setEditingId(n.id); setEditText(n.message_text); }} className="text-[11px] text-blue-400 hover:text-blue-300 font-bold cursor-pointer">✏️</button>
                <form action={deleteMassMessage}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" onClick={(e) => { if (!window.confirm("Diese Nachricht aus dem Archiv löschen?")) e.preventDefault(); }} className="text-[11px] text-red-400 hover:text-red-300 font-bold cursor-pointer">🗑️</button>
                </form>
              </div>
            </div>

            {editingId === n.id ? (
              <form action={updateMassMessage} onSubmit={() => setEditingId(null)} className="space-y-2">
                <input type="hidden" name="id" value={n.id} />
                <textarea name="message_text" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} className="w-full bg-[#050505] border border-[#AA7C11]/40 rounded p-1.5 text-xs text-white outline-none resize-none" />
                <div className="flex gap-1.5 justify-end text-[10px]">
                  <button type="button" onClick={() => setEditingId(null)} className="px-2 py-0.5 bg-slate-800 rounded">Abbrechen</button>
                  <button type="submit" className="px-2 py-0.5 bg-emerald-600 text-white rounded font-bold">Speichern</button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-slate-300 italic bg-[#050505]/60 p-2.5 rounded border border-[#AA7C11]/5 break-words">
                "{n.message_text}"
              </p>
            )}
          </div>

          {editingId !== n.id && (
            <button type="button" onClick={() => handleCopy(n.message_text, n.id)} className="w-full mt-3 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#AA7C11]/30 text-[#D4AF37] rounded py-1.5 text-xs font-bold transition cursor-pointer">
              {copiedId === n.id ? "✓ In Zwischenablage kopiert!" : "📋 Vorlage kopieren"}
            </button>
          )}

        </div>
      ))}
      {nachrichten.length === 0 && (
        <div className="col-span-2 text-xs text-slate-500 italic p-6 text-center">Keine genutzten Mass Messages im Kalender gefunden.</div>
      )}
    </div>
  );
}
