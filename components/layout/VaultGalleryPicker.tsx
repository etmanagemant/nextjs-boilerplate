"use client";

import { useEffect, useState } from "react";
import { useMediaProxyUrl } from "@/lib/useMediaProxyUrl";

interface MediaRef {
  label: string;
  thumbnailUrl?: string;
  id?: string;
}

interface VaultList {
  id: string;
  name: string;
}

interface VaultGalleryPickerProps {
  modelId: string;
  onSelect: (items: MediaRef[]) => void;
  onClose: () => void;
}

/**
 * A real thumbnail grid of the model's actual OnlyFans Vault, built
 * entirely in our own UI - no live/VNC view of OnlyFans at all, so
 * clicking a thumbnail here can never trigger OnlyFans' own native
 * multi-select mode (move/delete etc.) the way clicking inside an
 * embedded live view did. Data comes from sniffing the real request
 * OnlyFans' own Vault page makes when it loads (see /vault-media on the
 * VPS) - a request we make ourselves gets rejected, since OnlyFans signs
 * these calls with headers only its own front-end code computes.
 */
export function VaultGalleryPicker({ modelId, onSelect, onClose }: VaultGalleryPickerProps) {
  const [items, setItems] = useState<MediaRef[]>([]);
  const [lists, setLists] = useState<VaultList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mediaProxyUrl = useMediaProxyUrl(modelId);

  const keyOf = (m: MediaRef) => m.thumbnailUrl || m.label;
  const isSelected = (m: MediaRef) => selected.some((s) => keyOf(s) === keyOf(m));
  const toggle = (m: MediaRef) => {
    setSelected((prev) => (isSelected(m) ? prev.filter((s) => keyOf(s) !== keyOf(m)) : [...prev, m]));
  };

  const load = async (listId: string | null) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/vault-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, listId }),
      });
      const data = await res.json();
      if (data.status === "no_slot") {
        setError("Model ist gerade nicht verbunden.");
        setItems([]);
      } else if (data.status === "error") {
        setError(data.error || "Fehler beim Laden");
        setItems([]);
      } else {
        setItems(data.items || []);
        if (data.lists && data.lists.length > 0) setLists(data.lists);
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(activeListId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, activeListId]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-[#0A0A0A]/90 backdrop-blur-xl border-2 border-[#C9A86A]/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
          <h3 className="text-sm font-black text-[#C9A86A] uppercase tracking-wider">📁 Tresor - Medien auswählen</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        {lists.length > 0 && (
          <div className="flex gap-2 p-3 border-b border-[#9C7A3D]/10 overflow-x-auto flex-shrink-0">
            <button
              onClick={() => setActiveListId(null)}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase whitespace-nowrap transition ${
                activeListId === null ? "bg-[#C9A86A]/20 text-[#C9A86A]" : "text-slate-400 hover:text-[#E2C48A]"
              }`}
            >
              Alle
            </button>
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => setActiveListId(l.id)}
                className={`px-3 py-1.5 rounded text-xs font-bold uppercase whitespace-nowrap transition ${
                  activeListId === l.id ? "bg-[#C9A86A]/20 text-[#C9A86A]" : "text-slate-400 hover:text-[#E2C48A]"
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-sm text-slate-500 text-center py-8">Lädt...</p>}
          {!loading && error && <p className="text-sm text-red-400 text-center py-8">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">Keine Dateien gefunden.</p>
          )}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {items.map((item, i) => {
                const active = isSelected(item);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggle(item)}
                    title={item.label}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
                      active ? "border-[#C9A86A]" : "border-transparent hover:border-[#9C7A3D]/50"
                    }`}
                  >
                    {item.thumbnailUrl ? (
                      // Proxied through our backend - OnlyFans' thumbnail
                      // URLs are IP-locked to the VPS itself, so loading
                      // them directly here would just 403.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaProxyUrl(item.thumbnailUrl, "thumbnail")}
                        alt={item.label}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#050505] flex items-center justify-center text-[10px] text-slate-500 p-1 text-center">
                        {item.label}
                      </div>
                    )}
                    {active && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#C9A86A] text-black text-xs font-bold flex items-center justify-center">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-white/10 flex-shrink-0">
          <span className="text-xs text-slate-500">{selected.length} ausgewählt</span>
          <button
            type="button"
            onClick={() => {
              onSelect(selected);
              onClose();
            }}
            className="px-5 py-2.5 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider text-xs transition shadow-lg"
          >
            ✓ Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
