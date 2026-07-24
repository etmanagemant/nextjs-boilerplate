"use client";

import { useEffect, useRef, useState } from "react";
import { fetchModelNotes, updateModelNotes } from "@/app/crm-inbox/actions";

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
 * General notes about a model (not fan-specific) - admin-writable, shown as
 * a clean read-only display for chatters. Shown both as the CRM Inbox
 * placeholder (when no fan chat is open in OnlyFans yet) and inside the Fan
 * CRM panel's Info section (so it's visible either way) - same underlying
 * per-model data (models.notes) as Native Chat Mode's Sales Cockpit uses,
 * just a second place it's surfaced.
 */
export function ModelNotesPanel({ modelId, isAdmin, compact = false }: ModelNotesPanelProps) {
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const lastSavedRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetchModelNotes(modelId).then((value) => {
      if (cancelled) return;
      setNotes(value || "");
      lastSavedRef.current = value || "";
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

  if (!isAdmin) {
    return (
      <div className={compact ? "" : "flex-1 flex items-center justify-center p-6"}>
        <div className={compact ? "" : "text-center"}>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">
            🏢 Model-Notizen
          </p>
          <p className="text-xs text-[#F3E5AB] whitespace-pre-wrap">
            {loaded && notes ? notes : <span className="text-slate-600">Noch keine Notizen vom Admin</span>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "flex-1 p-4"}>
      <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">🏢 Model-Notizen</p>
      <textarea
        value={notes}
        onChange={handleChange}
        onBlur={() => save(notes)}
        placeholder="Allgemeine Notizen zu diesem Model (für Chatter sichtbar)..."
        className={`w-full bg-black/60 border border-[#D4AF37]/30 rounded p-2 text-xs text-[#F3E5AB] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#D4AF37] resize-none ${
          compact ? "h-16" : "h-32"
        }`}
      />
    </div>
  );
}
