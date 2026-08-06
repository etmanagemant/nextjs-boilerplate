"use client";

import { useEffect, useState } from "react";
import { useMediaProxyUrl } from "@/lib/useMediaProxyUrl";
import { formatDuration } from "@/lib/formatDuration";

export interface MediaRef {
  label: string;
  thumbnailUrl?: string;
  id?: string;
  type?: string;
  // Volle Auflösung für die Vollbild-Vorschau - die Grid-Thumbnails
  // selbst bleiben bewusst die kleine 300x300-Version.
  fullUrl?: string;
  // Sekunden, nur bei Videos vorhanden (echtes OnlyFans-Feld).
  duration?: number;
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

const VAULT_TYPE_LABEL: Record<string, string> = { photo: "Foto", video: "Video", gif: "GIF", audio: "Audio" };

/**
 * A real thumbnail grid of the model's actual OnlyFans Vault, built
 * entirely in our own UI - no live/VNC view of OnlyFans at all, so
 * clicking a thumbnail here can never trigger OnlyFans' own native
 * multi-select mode (move/delete etc.) the way clicking inside an
 * embedded live view did. Bugfix (gemeldet 2026-08-06): früher über das
 * alte VNC-Chatterslot-sniffing (/api/crm/vault-media) geladen, das
 * einen gerade offenen Live-View für dieses Model brauchte - im Script
 * Vault gibt es den nie, daher immer "Model ist gerade nicht verbunden."
 * obwohl das Model über OF Inbox Beta längst verbunden war. Nutzt jetzt
 * dieselben signierten Endpunkte wie OF Inbox Betas eigenes Tresor-
 * Popup (/api/crm/of-inbox/vault-lists + vault-media), die nur die
 * ohnehin persistente Model-Session brauchen, keinen VNC-Slot.
 */
export function VaultGalleryPicker({ modelId, onSelect, onClose }: VaultGalleryPickerProps) {
  const [items, setItems] = useState<MediaRef[]>([]);
  const [lists, setLists] = useState<VaultList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lightboxItem, setLightboxItem] = useState<MediaRef | null>(null);
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
      const res = await fetch(`/api/crm/of-inbox/vault-media?modelId=${encodeURIComponent(modelId)}&offset=0${listId ? `&listId=${encodeURIComponent(listId)}` : ""}`);
      const data = await res.json();
      if (!res.ok || data.status !== "success") {
        setError(data.error || "Fehler beim Laden");
        setItems([]);
        return;
      }
      const list = data.data?.list || [];
      setItems(
        list.map((m: any) => ({
          id: String(m.id),
          label: VAULT_TYPE_LABEL[m.type] || "Medium",
          thumbnailUrl: m.files?.thumb?.url || m.files?.preview?.url || m.files?.full?.url,
          fullUrl: m.files?.full?.url || m.files?.preview?.url || m.files?.thumb?.url,
          type: m.type,
          duration: typeof m.duration === "number" ? m.duration : undefined,
        }))
      );
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!modelId) return;
    fetch(`/api/crm/of-inbox/vault-lists?modelId=${encodeURIComponent(modelId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status !== "success") return;
        setLists((data.data?.list || []).map((l: any) => ({ id: String(l.id), name: l.name })));
      })
      .catch(() => {});
  }, [modelId]);

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
                  <div
                    key={i}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
                      active ? "border-[#C9A86A]" : "border-transparent hover:border-[#9C7A3D]/50"
                    }`}
                  >
                    {/* Klick in die Mitte oeffnet die Vollbild-Vorschau -
                        Auswaehlen passiert ueber den Kreis oben links,
                        damit man vorher sehen kann, was man auswaehlt. */}
                    <button type="button" onClick={() => setLightboxItem(item)} title={item.label} className="w-full h-full block outline-none">
                      {item.thumbnailUrl ? (
                        // Proxied through our backend, direkt Browser->VPS -
                        // OnlyFans' CDN-URLs sind IP-gesperrt auf die VPS.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaProxyUrl(item.thumbnailUrl)}
                          alt={item.label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#050505] flex items-center justify-center text-[10px] text-slate-500 p-1 text-center">
                          {item.label}
                        </div>
                      )}
                      {item.type === "video" && (
                        <>
                          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="w-9 h-9 rounded-full bg-[#C9A86A] flex items-center justify-center shadow-lg">
                              <span className="text-black text-sm ml-0.5">▶</span>
                            </span>
                          </span>
                          {typeof item.duration === "number" && (
                            <span className="absolute bottom-1 right-1 text-[9px] font-bold bg-black/70 text-white px-1 rounded">{formatDuration(item.duration)}</span>
                          )}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(item)}
                      title={active ? "Abwählen" : "Auswählen"}
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold transition outline-none ${
                        active ? "bg-[#C9A86A] border-[#C9A86A] text-black" : "bg-black/50 border-white/60 text-transparent hover:border-[#C9A86A]"
                      }`}
                    >
                      {active && "✓"}
                    </button>
                  </div>
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

      {lightboxItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightboxItem(null)}>
          <div className="max-w-3xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {lightboxItem.type === "video" ? (
              <video src={lightboxItem.fullUrl ? mediaProxyUrl(lightboxItem.fullUrl) : undefined} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />
            ) : lightboxItem.type === "audio" ? (
              <audio src={lightboxItem.fullUrl ? mediaProxyUrl(lightboxItem.fullUrl) : undefined} controls autoPlay className="w-96" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightboxItem.fullUrl ? mediaProxyUrl(lightboxItem.fullUrl) : undefined} alt="" className="max-w-full max-h-[85vh] rounded-lg object-contain" />
            )}
          </div>
          <button onClick={() => setLightboxItem(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl leading-none">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
