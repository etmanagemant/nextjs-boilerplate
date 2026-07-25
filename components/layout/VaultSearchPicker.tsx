"use client";

import { useEffect, useRef, useState } from "react";

interface MediaRef {
  label: string;
  thumbnailUrl?: string;
}

interface VaultSearchPickerProps {
  modelId: string;
  initialSelected: MediaRef[];
  onSelect: (items: MediaRef[]) => void;
  onClose: () => void;
}

/**
 * Small inline overlay (not a separate window/modal showing the whole
 * OnlyFans interface) - scrapes the model's real Vault contents and
 * shows them as a clickable thumbnail grid, with selection tracked
 * entirely in our OWN state (checkmarks), not read back from OnlyFans'
 * own DOM. Replaces an earlier VNC-embedded picker whose "read what's
 * selected" step turned out to match every file in the vault instead of
 * just the clicked ones.
 */
export function VaultSearchPicker({ modelId, initialSelected, onSelect, onClose }: VaultSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaRef[]>([]);
  const [selected, setSelected] = useState<MediaRef[]>(initialSelected);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keyOf = (m: MediaRef) => m.thumbnailUrl || m.label;
  const isSelected = (m: MediaRef) => selected.some((s) => keyOf(s) === keyOf(m));

  const toggle = (m: MediaRef) => {
    setSelected((prev) => (isSelected(m) ? prev.filter((s) => keyOf(s) !== keyOf(m)) : [...prev, m]));
  };

  const search = async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/vault-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, query: q }),
      });
      const data = await res.json();
      if (data.status === "no_slot" || data.status === "no_session") {
        setError("Model ist gerade nicht verbunden.");
        setItems([]);
      } else if (data.status === "error") {
        setError(data.error || "Fehler beim Laden");
        setItems([]);
      } else {
        setItems(data.items || []);
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // A chatter slot has to exist for this model before /vault-list can
    // find a browser session to scrape - assign one first (idempotent if
    // one's already running), then load the initial unfiltered list.
    (async () => {
      try {
        await fetch("/api/crm/chatter-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId }),
        });
      } catch {
        /* ignore - /vault-list will surface "no_slot" if this failed */
      }
      search("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-30 mt-2 w-96 max-w-full bg-[#0A0A0A] border border-[#C9A86A]/40 rounded-xl shadow-2xl p-3"
    >
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Im Tresor suchen..."
        className="w-full bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#C9A86A] mb-2"
      />

      <div className="max-h-64 overflow-y-auto">
        {loading && <p className="text-xs text-slate-500 px-2 py-3 text-center">Lädt...</p>}
        {!loading && error && <p className="text-xs text-red-400 px-2 py-3 text-center">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-slate-500 px-2 py-3 text-center">Keine Dateien gefunden.</p>
        )}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {items.map((item, i) => {
              const active = isSelected(item);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(item)}
                  title={item.label}
                  className={`relative aspect-square rounded overflow-hidden border-2 transition ${
                    active ? "border-[#C9A86A]" : "border-transparent hover:border-[#9C7A3D]/50"
                  }`}
                >
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnailUrl} alt={item.label} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#050505] flex items-center justify-center text-[10px] text-slate-500 p-1 text-center">
                      {item.label}
                    </div>
                  )}
                  {active && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#C9A86A] text-black text-[10px] font-bold flex items-center justify-center">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[#9C7A3D]/10">
        <span className="text-[10px] text-slate-500">{selected.length} ausgewählt</span>
        <button
          type="button"
          onClick={() => {
            onSelect(selected);
            onClose();
          }}
          className="px-4 py-1.5 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded text-xs uppercase"
        >
          ✓ Übernehmen
        </button>
      </div>
    </div>
  );
}
