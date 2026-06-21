"use client";

import { useState } from "react";
import { deleteMassMessage, updateMassMessage } from "@/app/massmessage/actions";

export default function MassMessageListClient({ aktuelleWoche, archivierteMonate }: { aktuelleWoche: any[]; archivierteMonate: Record<string, any[]> }) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  
  // State für geöffnete Monate im Akkordeon-Format
  const [openMonate, setOpenMonate] = useState<Record<string, boolean>>({});

  function toggleMonat(monat: string) {
    setOpenMonate(prev => ({ ...prev, [monat]: !prev[monat] }));
  }

  function handleCopy(text: string, id: number) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Interne Render-Funktion für die Kacheln, um Code-Dopplung zu vermeiden
  const renderKarten = (nachrichtenListe: any[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {nachrichtenListe.map((n) => (
        <div key={n.id} className="bg-black/30 border border-[#AA7C11]/20 rounded-xl p-4 flex flex-col justify-between hover:border-[#D4AF37]/40 transition relative group">
          <div>
            <div className="flex justify-between items-center border-b border-[#AA7C11]/10 pb-2 mb-2">
              <span className="text-xs font-black text-[#D4AF37] uppercase tracking-wide">Model: {n.model_name}</span>
              <span className="text-[10px] text-slate-500 font-semibold">{n.datum}</span>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => { setEditingId(n.id); setEditText(n.message_text); }} className="text-[11px] text-blue-400 font-bold cursor-pointer">✏️</button>
                <form action={deleteMassMessage}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" onClick={(e) => { if (!window.confirm("Diese Nachricht löschen?")) e.preventDefault(); }} className="text-[11px] text-red-400 font-bold cursor-pointer">🗑️</button>
                </form>
              </div>
            </div>

            {editingId === n.id ? (
              <div className="space-y-2">
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} className="w-full bg-[#050505] border border-[#AA7C11]/40 rounded p-1.5 text-xs text-white outline-none resize-none" />
                <div className="flex gap-1.5 justify-end text-[10px]">
                  <button type="button" onClick={() => setEditingId(null)} className="px-2 py-0.5 bg-slate-800 rounded">Abbrechen</button>
                  <button type="button" onClick={async () => {
                    const fd = new FormData(); fd.append("id", String(n.id)); fd.append("message_text", editText);
                    await updateMassMessage(fd); setEditingId(null);
                  }} className="px-2 py-0.5 bg-emerald-600 text-white rounded font-bold">Speichern</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-300 italic bg-[#050505]/60 p-2.5 rounded border border-[#AA7C11]/5 break-words">"{n.message_text}"</p>
            )}
          </div>
          {editingId !== n.id && (
            <button type="button" onClick={() => handleCopy(n.message_text, n.id)} className="w-full mt-3 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#AA7C11]/30 text-[#D4AF37] rounded py-1.5 text-xs font-bold transition cursor-pointer">
              {copiedId === n.id ? "✓ In Zwischenablage kopiert!" : "📋 Vorlage kopieren"}
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* 1. SEKTION: Aktuelle Woche (Immer ausgeklappt) */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-3 py-1.5 rounded-lg tracking-wider uppercase">✨ Aktuelle Woche (Neueste Vorlagen)</h3>
        {aktuelleWoche.length > 0 ? renderKarten(aktuelleWoche) : <p className="text-xs text-slate-500 italic p-2">In dieser Woche noch keine Nachrichten erfasst.</p>}
      </div>

      {/* 2. SEKTION: Archivierte Vormonate (Klickbare Akkordeons) */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-[#D4AF37] bg-[#AA7C11]/5 border border-[#AA7C11]/10 px-3 py-1.5 rounded-lg tracking-wider uppercase">📦 Archivierte Vormonate</h3>
        <div className="space-y-2">
          {Object.entries(archivierteMonate).map(([monat, liste]) => {
            const isOpen = !!openMonate[monat];
            return (
              <div key={monat} className="border border-[#AA7C11]/10 rounded-xl bg-black/10 overflow-hidden">
                {/* Klickbarer Header für die Staffelung */}
                <button type="button" onClick={() => toggleMonat(monat)} className="w-full flex justify-between items-center px-4 py-3 bg-[#050505] hover:bg-black/40 text-xs font-bold text-slate-200 uppercase tracking-wide transition outline-none cursor-pointer">
                  <span>🗓️ {monat} ({liste.length} Nachrichten)</span>
                  <span className="text-[#D4AF37] font-mono text-sm">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && <div className="p-4 bg-[#0A0A0A] border-t border-[#AA7C11]/10">{renderKarten(liste)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
