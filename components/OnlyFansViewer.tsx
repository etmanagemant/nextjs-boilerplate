"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadRFB } from "@/lib/loadRfb";

interface OnlyFansViewerProps {
  modelId: string;
  modelName?: string;
  onClose: () => void;
  isModal?: boolean;
  isEmbedded?: boolean;
  emojis?: string[];
}

const DEFAULT_EMOJIS = ["😊", "😂", "🔥", "❤️", "😍", "👏", "🎉", "😘", "🥵", "💦", "😉", "🙈"];

/**
 * OnlyFansViewer - live view of a model's persistent browser session on the
 * VPS, via a real VNC connection (same underlying display and session the
 * admin logs into via the Connection Hub - after a successful login that
 * browser keeps running, and this is the second window onto it). Replaces
 * the old MJPEG-stream/screenshot-poll + custom click-keyboard-relay
 * architecture, which was slow and error-prone; VNC forwards mouse/
 * keyboard/scroll natively as part of the protocol.
 */
export function OnlyFansViewer({
  modelId,
  modelName = "OnlyFans",
  onClose,
  isModal = false,
  isEmbedded = true,
  emojis = DEFAULT_EMOJIS,
}: OnlyFansViewerProps) {
  const [phase, setPhase] = useState<"connecting" | "live" | "no-session" | "error">("connecting");
  const [error, setError] = useState("");
  const [pasteStatus, setPasteStatus] = useState<"idle" | "done">("idle");

  const vncContainerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);

  const connectVnc = async (): Promise<void> => {
    // "Does a live browser exist for this model at all" - VNC itself has no
    // concept of that, and if there's genuinely no session, opening a VNC
    // connection would just fail with a generic error instead of a clear
    // "please reconnect" prompt.
    const statusRes = await fetch(`/api/crm/browser-login/status?modelId=${encodeURIComponent(modelId)}`);
    const statusData = statusRes.ok ? await statusRes.json() : {};
    if (!statusData.hasSession) {
      // The VPS browser can disappear for reasons that have nothing to do
      // with the admin explicitly disconnecting (a VPS deploy/restart, a
      // crash, the idle timeout) - Supabase's is_active flag has no way to
      // learn that on its own, so without this the Connection Hub keeps
      // showing "verbunden" for a model that's actually completely dead.
      // Best-effort: this view just noticed the mismatch, so it's the one
      // fixing it, but a failure here shouldn't block showing the correct
      // "not connected" prompt either way.
      fetch("/api/crm/browser-login/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      }).catch(() => {});
      setPhase("no-session");
      return;
    }

    const [RFB, vncInfoRes] = await Promise.all([
      loadRFB(),
      fetch("/api/crm/browser-login/vnc-info"),
    ]);
    if (!vncInfoRes.ok) throw new Error("VNC-Verbindung konnte nicht eingerichtet werden");
    const { wsUrl, password } = await vncInfoRes.json();
    if (!wsUrl || !vncContainerRef.current) throw new Error("VNC-Verbindung konnte nicht eingerichtet werden");

    vncContainerRef.current.innerHTML = "";
    const rfb = new RFB(vncContainerRef.current, wsUrl, { credentials: { password } });
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfbRef.current = rfb;

    rfb.addEventListener("disconnect", (e: any) => {
      console.warn("[VIEWER] VNC disconnected:", e?.detail);
      setPhase("error");
      setError("Verbindung zur Sitzung wurde getrennt");
    });
    rfb.addEventListener("securityfailure", (e: any) => {
      console.warn("[VIEWER] VNC auth failed:", e?.detail);
      setPhase("error");
      setError("VNC-Authentifizierung fehlgeschlagen");
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("VNC-Verbindung dauert zu lange")), 10000);
      rfb.addEventListener("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    setPhase("live");
  };

  const start = async () => {
    setPhase("connecting");
    setError("");
    try {
      await connectVnc();
    } catch (err: any) {
      setPhase("error");
      setError(err.message || "Unbekannter Fehler beim Verbinden");
    }
  };

  useEffect(() => {
    start();
    return () => {
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

  // VNC has no way to inject text directly into whatever's focused on the
  // remote page - clipboard paste (same trick as the login view's "@"
  // workaround) is the only reliable path for arbitrary text, emoji
  // included. One click copies it to the remote clipboard; a manual
  // Strg+V after clicking into the chat field pastes it.
  const handlePasteEmoji = (emoji: string) => {
    if (!rfbRef.current) return;
    try {
      rfbRef.current.clipboardPasteFrom(emoji);
      setPasteStatus("done");
      setTimeout(() => setPasteStatus("idle"), 1200);
    } catch (err) {
      console.error("[VIEWER] Emoji paste error:", err);
    }
  };

  const viewerContent = (
    <div className="relative w-full h-full bg-gradient-to-br from-[#0A0A0A] to-[#050505] rounded-lg overflow-hidden border border-[#D4AF37]/10">
      {phase === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/60 to-[#0A0A0A]/80 z-10 backdrop-blur-sm">
          <div className="text-center">
            <div className="animate-spin mb-4 text-3xl">⏳</div>
            <p className="text-[#F3E5AB] font-bold text-lg">Verbinde...</p>
          </div>
        </div>
      )}

      {phase === "no-session" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/80 to-[#0A0A0A]/90 z-20 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-[#2D1A0A] to-[#1A0F05] border-2 border-[#D4AF37]/40 rounded-xl p-6 text-[#F3E5AB] max-w-md shadow-2xl text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="font-black mb-2 text-lg text-[#D4AF37] uppercase tracking-wider">Nicht verbunden</p>
            <p className="text-sm text-slate-300 mb-5">
              Für {modelName} läuft gerade keine aktive Sitzung. Bitte im Connection Hub verbinden.
            </p>
            <Link
              href="/management/crm-connect"
              className="inline-block px-5 py-3 bg-gradient-to-b from-[#D4AF37] to-[#8A6D3F] hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-bold rounded-lg text-sm transition shadow-lg hover:shadow-[#D4AF37]/40"
            >
              🔗 Zum Connection Hub
            </Link>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/80 to-[#0A0A0A]/90 z-10 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-[#2D1A0A] to-[#1A0F05] border-2 border-[#D4AF37]/40 rounded-xl p-6 text-[#F3E5AB] max-w-md shadow-2xl text-center">
            <p className="font-black mb-3 text-lg text-[#D4AF37] uppercase tracking-wider">⚠️ Verbindungsfehler</p>
            <p className="text-sm text-slate-300 mb-5">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={start}
                className="px-4 py-3 bg-gradient-to-b from-[#D4AF37] to-[#8A6D3F] hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-bold rounded-lg text-sm transition shadow-lg hover:shadow-[#D4AF37]/40"
              >
                🔄 Erneut versuchen
              </button>
              {isModal && (
                <button
                  onClick={onClose}
                  className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg text-sm transition shadow-lg"
                >
                  Schließen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stays mounted through connecting/live so the ref already exists by
          the time connectVnc() runs - the login view hit exactly this bug
          when the container was only rendered in "live". */}
      {(phase === "connecting" || phase === "live") && (
        <div ref={vncContainerRef} className="w-full h-full" />
      )}

      {phase === "live" && (
        <>
          <div className="absolute top-2 right-2 z-20 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            🟢 Live
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] overflow-x-auto flex gap-1.5 px-3 py-2 rounded-full bg-black/80 border border-[#D4AF37]/40 backdrop-blur-sm shadow-2xl">
            {emojis.map((emoji, i) => (
              <button
                key={i}
                onClick={() => handlePasteEmoji(emoji)}
                className="text-lg leading-none flex-shrink-0 hover:scale-125 transition-transform cursor-pointer"
                title="In Zwischenablage kopieren, dann Strg+V im Chat-Feld"
              >
                {emoji}
              </button>
            ))}
          </div>

          {pasteStatus === "done" && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 text-[11px] text-emerald-400 bg-black/80 px-3 py-1 rounded-full border border-emerald-500/30">
              Kopiert — Strg+V im Chat-Feld zum Einfügen
            </div>
          )}
        </>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 flex items-center justify-center p-4">
        <div className="w-full max-w-[1900px] h-[92vh] rounded-xl overflow-hidden shadow-2xl border-2 border-[#D4AF37]/40 bg-[#050505]">
          {viewerContent}
        </div>
      </div>
    );
  }

  if (isEmbedded) {
    return (
      <div className="w-full h-full bg-[#0A0A0A] overflow-hidden border border-[#D4AF37]/20">
        {viewerContent}
      </div>
    );
  }

  return viewerContent;
}
