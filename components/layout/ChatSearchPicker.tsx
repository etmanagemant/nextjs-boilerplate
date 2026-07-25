"use client";

import { useEffect, useRef, useState } from "react";

interface ChatSearchPickerProps {
  modelId: string;
  onSelect: (label: string) => void;
  onClose: () => void;
}

/**
 * Small inline overlay (not a separate window/modal showing the whole
 * OnlyFans interface) - types the query into OnlyFans' own chat-list
 * search server-side and lists back the matching names. Replaces an
 * earlier VNC-embedded picker the admin found confusing and too heavy
 * for what's really just "search a name, pick it".
 */
export function ChatSearchPicker({ modelId, onSelect, onClose }: ChatSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<{ label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/chat-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, query: q }),
      });
      const data = await res.json();
      if (data.status === "no_session") {
        setError("Model ist gerade nicht verbunden.");
        setItems([]);
      } else if (data.status === "error") {
        setError(data.error || "Fehler bei der Suche");
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
    search("");
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
      className="absolute left-0 top-full z-30 mt-2 w-80 max-w-full bg-[#0A0A0A] border border-[#C9A86A]/40 rounded-xl shadow-2xl p-3"
    >
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nach Namen suchen..."
        className="w-full bg-[#050505] border border-[#9C7A3D]/30 rounded px-3 py-2 text-white text-sm outline-none focus:border-[#C9A86A] mb-2"
      />
      <div className="max-h-56 overflow-y-auto space-y-1">
        {loading && <p className="text-xs text-slate-500 px-2 py-3 text-center">Lädt...</p>}
        {!loading && error && <p className="text-xs text-red-400 px-2 py-3 text-center">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-slate-500 px-2 py-3 text-center">Keine Chats gefunden.</p>
        )}
        {!loading &&
          items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSelect(item.label);
                onClose();
              }}
              className="w-full text-left px-3 py-2 rounded text-sm text-[#E2C48A] hover:bg-[#C9A86A]/15 transition"
            >
              {item.label}
            </button>
          ))}
      </div>
    </div>
  );
}
