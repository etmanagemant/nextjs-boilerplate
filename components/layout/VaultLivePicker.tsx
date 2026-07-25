"use client";

import { useEffect, useRef, useState } from "react";
import { loadRFB } from "@/lib/loadRfb";

interface MediaRef {
  label: string;
  thumbnailUrl?: string;
}

interface VaultLivePickerProps {
  modelId: string;
  onSelect: (items: MediaRef[]) => void;
  onClose: () => void;
}

/**
 * Embeds a live VNC view of the model's real OnlyFans Vault - visual
 * browsing (folders/categories/thumbnails) can't be reliably replicated
 * outside the real site, so the admin sees and clicks the actual Vault
 * here. What changed from the first attempt at this: instead of trying
 * to read OnlyFans' own "selected" CSS state after the fact (which
 * matched every file in the vault, not just the clicked ones), a click
 * listener injected server-side records each image click as it happens
 * (see /vault-picker-goto) - "Übernehmen" just reads that log back.
 */
export function VaultLivePicker({ modelId, onSelect, onClose }: VaultLivePickerProps) {
  const [phase, setPhase] = useState<"connecting" | "live" | "error">("connecting");
  const [error, setError] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const vncContainerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const slotRes = await fetch("/api/crm/chatter-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId }),
        });
        const slotData = slotRes.ok ? await slotRes.json() : {};
        if (cancelled) return;
        if (slotData.status !== "success" || !slotData.wsUrl) {
          setPhase("error");
          setError("Keine aktive Sitzung für dieses Model.");
          return;
        }

        // Point this slot at the real Vault + inject the click-tracker
        // before showing the feed.
        await fetch("/api/crm/vault-picker/goto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId }),
        });

        const RFB = await loadRFB();
        if (cancelled || !vncContainerRef.current) return;
        vncContainerRef.current.innerHTML = "";
        const rfb = new RFB(vncContainerRef.current, slotData.wsUrl, { credentials: { password: slotData.password } });
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfbRef.current = rfb;

        rfb.addEventListener("disconnect", () => {
          if (!cancelled) {
            setPhase("error");
            setError("Verbindung getrennt.");
          }
        });

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Verbindung dauert zu lange")), 10000);
          rfb.addEventListener("connect", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        if (!cancelled) setPhase("live");
      } catch (err: any) {
        if (!cancelled) {
          setPhase("error");
          setError(err.message || "Unbekannter Fehler");
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      if (rfbRef.current) {
        try {
          rfbRef.current.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const handleConfirm = async () => {
    setIsCapturing(true);
    try {
      const res = await fetch("/api/crm/vault-picker/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json();
      onSelect(data.items || []);
    } catch (err) {
      console.error("Error reading vault selection:", err);
    } finally {
      setIsCapturing(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#0A0A0A] border-2 border-[#C9A86A]/40 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#9C7A3D]/20">
          <h3 className="text-sm font-black text-[#C9A86A] uppercase tracking-wider">📁 Tresor - Medien auswählen</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="relative bg-black" style={{ aspectRatio: "1280 / 800" }}>
          {phase === "connecting" && (
            <div className="absolute inset-0 flex items-center justify-center text-[#E2C48A]">
              <div className="text-center">
                <div className="animate-spin mb-3 text-2xl">⏳</div>
                <p className="text-sm font-bold">Verbinde mit Tresor...</p>
              </div>
            </div>
          )}
          {phase === "error" && (
            <div className="absolute inset-0 flex items-center justify-center text-center p-6">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          <div ref={vncContainerRef} className="w-full h-full" />
        </div>

        <div className="p-4 border-t border-[#9C7A3D]/20 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Im Tresor navigieren und die gewünschten Dateien anklicken (Mehrfachauswahl möglich - erneut klicken hebt die Auswahl wieder auf), dann übernehmen.
          </p>
          <button
            onClick={handleConfirm}
            disabled={phase !== "live" || isCapturing}
            className="flex-shrink-0 px-5 py-2.5 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider text-xs transition shadow-lg disabled:opacity-40"
          >
            {isCapturing ? "Übernehme..." : "✓ Übernehmen"}
          </button>
        </div>
      </div>
    </div>
  );
}
