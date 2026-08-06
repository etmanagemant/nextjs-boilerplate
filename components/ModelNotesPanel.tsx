"use client";

import { useEffect, useRef, useState } from "react";
import { fetchModelNotes, updateModelNotes, fetchModelNoGoList, updateModelNoGoList } from "@/app/crm-inbox/actions";

interface ModelNotesPanelProps {
  modelId: string;
  isAdmin: boolean;
  compact?: boolean;
}

// Saves on every space/period/comma/Enter, not just on blur - relying on
// blur alone turned out unreliable here (clicking back into the VNC video
// to keep chatting doesn't always fire it the way clicking a normal form
// field would).
const TRIGGER_CHARS = [" ", ".", ",", "\n"];

/**
 * Model-CRM: strukturierte No-Go-Liste + freie allgemeine Notizen (nicht
 * fan-spezifisch) - admin-writable, read-only fuer Chatter. Bleibt
 * naturgemaess gleich egal welcher Fan gerade offen ist (im Gegensatz zum
 * Fan-CRM-Panel) - selbe models.notes/no_go_list Daten wie Native Chat
 * Mode's Sales Cockpit, hier nur ein zweiter Anzeigeort (2026-08-07:
 * jetzt als eigener Tab im Fan-CRM-Kasten selbst, siehe FanCrmPanel).
 */
export function ModelNotesPanel({ modelId, isAdmin, compact = false }: ModelNotesPanelProps) {
  const [notes, setNotes] = useState("");
  const [noGoList, setNoGoList] = useState<string[]>([]);
  const [newNoGoItem, setNewNoGoItem] = useState("");
  const [loaded, setLoaded] = useState(false);
  const lastSavedRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    Promise.all([fetchModelNotes(modelId), fetchModelNoGoList(modelId)]).then(([notesValue, noGoValue]) => {
      if (cancelled) return;
      setNotes(notesValue || "");
      lastSavedRef.current = notesValue || "";
      setNoGoList(noGoValue || []);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const save = (value: string) => {
    if (value === lastSavedRef.current) return;
    lastSavedRef.current = value;
    updateModelNotes(modelId, value).catch((err) => console.error("[MODEL-NOTES] Save error:", err));
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    const lastChar = value.slice(-1);
    if (TRIGGER_CHARS.includes(lastChar)) {
      save(value);
    }
  };

  const addNoGoItem = () => {
    const value = newNoGoItem.trim();
    if (!value) return;
    const updated = [...noGoList, value];
    setNoGoList(updated);
    setNewNoGoItem("");
    updateModelNoGoList(modelId, updated).catch((err) => console.error("[MODEL-NOTES] No-Go save error:", err));
  };

  const removeNoGoItem = (index: number) => {
    const updated = noGoList.filter((_, i) => i !== index);
    setNoGoList(updated);
    updateModelNoGoList(modelId, updated).catch((err) => console.error("[MODEL-NOTES] No-Go save error:", err));
  };

  if (!isAdmin) {
    return (
      <div className={compact ? "space-y-3" : "flex-1 p-6 space-y-4"}>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">🚫 No-Go-Liste</p>
          {loaded && noGoList.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {noGoList.map((item, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/30">
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-600">Keine Einschränkungen hinterlegt</span>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">🏢 Allgemeine Infos</p>
          <p className="text-xs text-[#E2C48A] whitespace-pre-wrap">
            {loaded && notes ? notes : <span className="text-slate-600">Noch keine Notizen vom Admin</span>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "flex-1 p-4 space-y-4"}>
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">🚫 No-Go-Liste</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {noGoList.length === 0 && <span className="text-xs text-slate-600">Noch keine Einträge</span>}
          {noGoList.map((item, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/30 flex items-center gap-1">
              {item}
              <button onClick={() => removeNoGoItem(i)} className="hover:text-red-100">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newNoGoItem}
            onChange={(e) => setNewNoGoItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNoGoItem()}
            placeholder="z.B. keine Anal-Rollenspiele..."
            className="flex-1 bg-black/60 border border-red-500/20 rounded px-2 py-1 text-xs text-red-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500/50"
          />
          <button
            onClick={addNoGoItem}
            className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20"
          >
            +
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">🏢 Allgemeine Infos</p>
        <textarea
          value={notes}
          onChange={handleChange}
          onBlur={() => save(notes)}
          placeholder="Allgemeine Infos zu diesem Model (für Chatter sichtbar)..."
          className={`w-full bg-black/60 border border-[#C9A86A]/30 rounded p-2 text-xs text-[#E2C48A] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#C9A86A] resize-none ${
            compact ? "h-16" : "h-32"
          }`}
        />
      </div>
    </div>
  );
}
