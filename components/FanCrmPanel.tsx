"use client";

import { useEffect, useState } from "react";
import { ModelNotesPanel } from "@/components/ModelNotesPanel";

// Saves on every space/period/comma/Enter, not just on blur - relying on
// blur alone turned out unreliable here (clicking back into the VNC video
// to keep chatting doesn't reliably fire it the way clicking a normal form
// field would).
const TRIGGER_CHARS = [" ", ".", ",", "\n"];

interface FanMetadataFull {
  fan_id: string;
  model_id: string;
  real_name: string | null;
  location: string | null;
  age: string | null;
  came_from: string | null;
  preferences: string[] | null;
  notes: string | null;
  tags: string[] | null;
  lifetime_value: number | null;
  vip_tier: string | null;
  last_subscription_at: string | null;
  last_paid_at: string | null;
  created_at: string | null;
}

interface FanCrmPanelProps {
  modelId: string;
  fanId: string;
  metadata: FanMetadataFull;
  lastEditedBy?: string | null;
  onSaved: () => void;
  isAdmin: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("de-DE");
  } catch {
    return "-";
  }
}

/**
 * SuperCreator-style fan info/notes panel, shown next to the live OnlyFans
 * view whenever a specific fan conversation is detected as open (see
 * /api/crm/current-fan, which figures out which fan that is by reading the
 * chatter's own slot's current page URL - our app has no other visibility
 * into what's clicked inside the VNC view).
 */
export function FanCrmPanel({ modelId, fanId, metadata, lastEditedBy, onSaved, isAdmin }: FanCrmPanelProps) {
  const [realName, setRealName] = useState(metadata.real_name || "");
  const [location, setLocation] = useState(metadata.location || "");
  const [age, setAge] = useState(metadata.age || "");
  const [cameFrom, setCameFrom] = useState(metadata.came_from || "");
  const [notes, setNotes] = useState(metadata.notes || "");
  const [preferences, setPreferences] = useState<string[]>(metadata.preferences || []);
  const [newPreference, setNewPreference] = useState("");

  // Re-sync local editable state whenever a different fan's metadata comes
  // in (switching chats in OnlyFans itself) - but not on every poll tick
  // for the *same* fan, which would overwrite whatever the chatter is
  // mid-typing.
  useEffect(() => {
    setRealName(metadata.real_name || "");
    setLocation(metadata.location || "");
    setAge(metadata.age || "");
    setCameFrom(metadata.came_from || "");
    setNotes(metadata.notes || "");
    setPreferences(metadata.preferences || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanId]);

  const saveField = async (fields: Record<string, unknown>) => {
    try {
      await fetch("/api/crm/fan-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, fanId, fields }),
      });
      onSaved();
    } catch (err) {
      console.error("[FAN-CRM] Save error:", err);
    }
  };

  // Wires up an <input>/<textarea> to save immediately after a trigger
  // character, in addition to the onBlur fallback below - typing a whole
  // sentence and then clicking straight back into the OnlyFans video
  // (rather than into another form field) doesn't reliably fire blur.
  const withAutoSave = (setter: (v: string) => void, field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const value = e.target.value;
    setter(value);
    if (TRIGGER_CHARS.includes(value.slice(-1))) {
      saveField({ [field]: value });
    }
  };

  const handleAddPreference = () => {
    const value = newPreference.trim();
    if (!value) return;
    const updated = [...preferences, value];
    setPreferences(updated);
    setNewPreference("");
    saveField({ preferences: updated });
  };

  const handleRemovePreference = (index: number) => {
    const updated = preferences.filter((_, i) => i !== index);
    setPreferences(updated);
    saveField({ preferences: updated });
  };

  const isSpender = (metadata.lifetime_value || 0) > 0;

  return (
    <div className="w-80 flex-shrink-0 h-full bg-black/40 overflow-y-auto scrollbar-hide flex flex-col">
      <div className="sticky top-0 bg-black/60 p-4 border-b border-[#C9A86A]/20 z-10 flex items-center justify-between">
        <h2 className="text-sm font-black text-[#C9A86A] uppercase tracking-wider">👤 Fan CRM</h2>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block font-bold">Name</label>
          <input
            type="text"
            value={realName}
            onChange={withAutoSave(setRealName, "real_name")}
            onBlur={() => saveField({ real_name: realName })}
            placeholder="Name eingeben..."
            className="w-full bg-black/60 border border-[#C9A86A]/30 rounded px-2 py-1.5 text-sm text-[#E2C48A] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#C9A86A]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block font-bold">Standort</label>
            <input
              type="text"
              value={location}
              onChange={withAutoSave(setLocation, "location")}
              onBlur={() => saveField({ location })}
              placeholder="-"
              className="w-full bg-black/60 border border-[#C9A86A]/30 rounded px-2 py-1.5 text-sm text-[#E2C48A] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#C9A86A]"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block font-bold">Alter</label>
            <input
              type="text"
              value={age}
              onChange={withAutoSave(setAge, "age")}
              onBlur={() => saveField({ age })}
              placeholder="-"
              className="w-full bg-black/60 border border-[#C9A86A]/30 rounded px-2 py-1.5 text-sm text-[#E2C48A] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#C9A86A]"
            />
          </div>
        </div>

        <span
          className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${
            isSpender
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "bg-slate-700/40 text-slate-400 border border-slate-600/40"
          }`}
        >
          {isSpender ? "💰 Spender" : "Non-Spender"}
        </span>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">Preferences</label>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {preferences.length === 0 && <span className="text-xs text-slate-600">Noch keine Preferences</span>}
            {preferences.map((pref, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded bg-[#C9A86A]/20 text-[#C9A86A] border border-[#C9A86A]/30 flex items-center gap-1"
              >
                {pref}
                <button onClick={() => handleRemovePreference(i)} className="hover:text-red-400">
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newPreference}
              onChange={(e) => setNewPreference(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddPreference()}
              placeholder="Hinzufügen..."
              className="flex-1 bg-black/60 border border-[#C9A86A]/30 rounded px-2 py-1 text-xs text-[#E2C48A] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#C9A86A]"
            />
            <button
              onClick={handleAddPreference}
              className="text-xs px-2 py-1 rounded bg-[#C9A86A]/20 text-[#C9A86A] border border-[#C9A86A]/30 hover:bg-[#C9A86A]/30"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block font-bold">Notizen</label>
          <textarea
            value={notes}
            onChange={withAutoSave(setNotes, "notes")}
            onBlur={() => saveField({ notes })}
            placeholder="Notizen zu diesem Fan..."
            className="w-full h-20 bg-black/60 border border-[#C9A86A]/30 rounded p-2 text-xs text-[#E2C48A] placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#C9A86A] resize-none"
          />
        </div>

        <div className="border-t border-[#9C7A3D]/20 pt-3 space-y-1.5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">Info</p>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Fan seit</span>
            <span className="text-[#E2C48A]">{formatDate(metadata.created_at)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Letztes Abo</span>
            <span className="text-[#E2C48A]">{formatDate(metadata.last_subscription_at)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Gesamtausgaben</span>
            <span className="text-[#C9A86A] font-bold">${(metadata.lifetime_value || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Zuletzt bezahlt</span>
            <span className="text-[#E2C48A]">{formatDate(metadata.last_paid_at)}</span>
          </div>
          <div className="flex justify-between text-xs items-center">
            <span className="text-slate-500">Herkunft</span>
            <input
              type="text"
              value={cameFrom}
              onChange={withAutoSave(setCameFrom, "came_from")}
              onBlur={() => saveField({ came_from: cameFrom })}
              placeholder="-"
              className="w-24 bg-black/60 border border-[#C9A86A]/20 rounded px-1.5 py-0.5 text-xs text-[#E2C48A] text-right placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#C9A86A]"
            />
          </div>
          {lastEditedBy && (
            <p className="text-[10px] text-slate-500 text-right pt-1">
              zuletzt bearbeitet von {lastEditedBy}
            </p>
          )}
        </div>

        <div className="border-t border-[#9C7A3D]/20 pt-3">
          <ModelNotesPanel modelId={modelId} isAdmin={isAdmin} compact />
        </div>
      </div>
    </div>
  );
}
