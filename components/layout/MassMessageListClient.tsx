"use client";

import { useState } from "react";

type ClientNachricht = {
  id: number;
  model: string;
  mitarbeiter: string;
  nachricht: string;
  datum: string;
};

export default function MassMessageListClient({ nachrichten }: { nachrichten: ClientNachricht[] }) {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  function handleCopy(text: string, id: number) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {nachrichten.map((n) => (
        <div key={n.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition shadow-md relative group">
          <div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
              <span className="text-xs font-black text-amber-400 uppercase">Model: {n.model}</span>
              <span className="text-[10px] text-slate-500 font-medium">{n.datum}</span>
            </div>
            <p className="text-xs text-slate-300 italic bg-slate-950/50 p-2.5 rounded border border-slate-950 break-words line-clamp-3">
              "{n.nachricht}"
            </p>
          </div>
          <button type="button" onClick={() => handleCopy(n.nachricht, n.id)} className="w-full mt-3 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded py-1.5 text-xs font-bold transition cursor-pointer">
            {copiedId === n.id ? "✓ In Zwischenablage kopiert!" : "📋 Vorlage kopieren & reaktivieren"}
          </button>
        </div>
      ))}
    </div>
  );
}
