"use client";

import React, { useEffect, useRef, useState } from "react";

interface BrowserLoginStreamComponentProps {
  modelId: string;
  modelName: string;
  onClose: () => void;
  onSuccess: () => void;
}

// Loads noVNC's RFB client (an ES module, self-hosted at /novnc/) via an
// injected <script type="module">, once per page load - sidesteps Next.js/
// webpack trying to resolve it as part of the app's own module graph, since
// it's a plain static asset, not a bundled dependency.
let rfbLoadPromise: Promise<any> | null = null;
function loadRFB(): Promise<any> {
  if ((window as any).__RFB) return Promise.resolve((window as any).__RFB);
  if (rfbLoadPromise) return rfbLoadPromise;
  rfbLoadPromise = new Promise((resolve, reject) => {
    const onReady = () => {
      window.removeEventListener("__rfbready", onReady);
      resolve((window as any).__RFB);
    };
    window.addEventListener("__rfbready", onReady);
    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `
      import RFB from '/novnc/core/rfb.js';
      window.__RFB = RFB;
      window.dispatchEvent(new Event('__rfbready'));
    `;
    script.onerror = () => reject(new Error("noVNC konnte nicht geladen werden"));
    document.head.appendChild(script);
  });
  return rfbLoadPromise;
}

/**
 * Opens a real VNC connection (noVNC) to the model-login browser running on
 * the VPS's dedicated login display, so the admin can actually log in to
 * OnlyFans with genuine remote-desktop responsiveness - mouse/keyboard/
 * scroll forward natively as part of the VNC protocol, no custom relay.
 * Once a valid session is detected, shows "Creator verbinden" to persist
 * the cookies.
 */
export default function BrowserLoginStreamComponent({
  modelId,
  modelName,
  onClose,
  onSuccess,
}: BrowserLoginStreamComponentProps) {
  const [phase, setPhase] = useState<"opening" | "connecting" | "live" | "confirming" | "error">("opening");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string>("");

  const vncContainerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // VNC has no concept of "logged in" - it's purely visual/input. This is
  // the only thing still polled for.
  const checkLoginState = async () => {
    try {
      const res = await fetch(`/api/crm/screenshot?modelId=${encodeURIComponent(modelId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setIsLoggedIn(!!data.isLoggedIn);
    } catch (err) {
      console.error("[LOGIN-VIEW] state check error:", err);
    }
  };

  const connectVnc = async (): Promise<void> => {
    const [RFB, vncInfoRes] = await Promise.all([
      loadRFB(),
      fetch("/api/crm/browser-login/vnc-info"),
    ]);
    if (!vncInfoRes.ok) throw new Error("VNC-Verbindung konnte nicht eingerichtet werden");
    const { wsUrl, password } = await vncInfoRes.json();
    if (!wsUrl || !vncContainerRef.current) throw new Error("VNC-Verbindung konnte nicht eingerichtet werden");

    // Clear out any previous attempt's canvas before RFB attaches a new one.
    vncContainerRef.current.innerHTML = "";

    const rfb = new RFB(vncContainerRef.current, wsUrl, { credentials: { password } });
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfbRef.current = rfb;

    rfb.addEventListener("disconnect", (e: any) => {
      console.warn("[LOGIN-VIEW] VNC disconnected:", e?.detail);
    });
    rfb.addEventListener("securityfailure", (e: any) => {
      console.warn("[LOGIN-VIEW] VNC auth failed:", e?.detail);
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("VNC-Verbindung dauert zu lange")), 10000);
      rfb.addEventListener("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  };

  const start = async () => {
    setPhase("opening");
    setError("");
    try {
      const res = await fetch("/api/crm/browser-login/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Browser konnte nicht gestartet werden");
      }

      setPhase("connecting");
      await connectVnc();

      setPhase("live");
      await checkLoginState();
      pollRef.current = setInterval(checkLoginState, 2000);
    } catch (err: any) {
      setPhase("error");
      setError(err.message || "Unbekannter Fehler beim Starten");
    }
  };

  useEffect(() => {
    start();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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
    setPhase("confirming");
    try {
      const res = await fetch("/api/crm/browser-login/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Speichern fehlgeschlagen");
      }
      if (pollRef.current) clearInterval(pollRef.current);
      onSuccess();
    } catch (err: any) {
      setPhase("live");
      setError(err.message || "Speichern fehlgeschlagen");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] border border-[#D4AF37]/30 rounded-lg shadow-2xl w-[95vw] max-w-[1600px] p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-[#D4AF37] flex items-center gap-2">
              🌐 Live Browser-Login
              {phase === "live" && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  🟢 VNC live
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              <span className="font-bold text-[#D4AF37]">Model:</span> {modelName}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#D4AF37] transition text-xl">
            ✕
          </button>
        </div>

        {/* The VNC container stays mounted for the whole opening/connecting/
            live/confirming lifecycle - connectVnc() runs during "connecting",
            before the phase ever becomes "live", so this ref has to already
            exist by then or every attempt fails immediately (that was the
            actual bug, not a timing/patience issue). The spinner overlays
            on top instead of replacing it. */}
        {phase !== "error" && (
          <>
            <p className="text-xs text-slate-400 mb-2">
              Klicke in das Fenster und logge dich mit den Model-Zugangsdaten bei OnlyFans ein.
            </p>
            <div
              className="relative bg-black rounded-lg overflow-hidden border border-[#D4AF37]/30"
              style={{ height: "70vh" }}
            >
              <div ref={vncContainerRef} className="w-full h-full" />
              {(phase === "opening" || phase === "connecting") && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                  <div className="animate-spin mb-4">
                    <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
                  </div>
                  <p className="text-[#D4AF37] font-semibold">
                    {phase === "opening" ? "Browser wird gestartet..." : "VNC-Verbindung wird aufgebaut..."}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm">
                {isLoggedIn ? (
                  <span className="text-emerald-400 font-bold">✅ Login erkannt</span>
                ) : (
                  <span className="text-slate-500">⏳ Warte auf Login...</span>
                )}
              </div>
              <button
                onClick={handleConfirm}
                disabled={!isLoggedIn || phase === "confirming"}
                className={`py-3 px-6 rounded-lg font-bold uppercase tracking-wider text-sm transition ${
                  isLoggedIn && phase !== "confirming"
                    ? "bg-gradient-to-b from-green-500 to-green-700 text-white hover:shadow-lg hover:shadow-green-500/40"
                    : "bg-slate-700/40 text-slate-500 cursor-not-allowed"
                }`}
              >
                {phase === "confirming" ? "💾 Speichere..." : "✓ Creator verbinden"}
              </button>
            </div>

            {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
          </>
        )}

        {phase === "error" && (
          <div className="text-center py-8">
            <div className="mb-4 text-4xl">❌</div>
            <p className="text-red-400 mb-4">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={start}
                className="py-2 px-4 rounded-lg font-bold bg-gradient-to-b from-[#D4AF37] to-[#8A6D3F] text-black hover:from-[#F3E5AB] transition"
              >
                🔄 Erneut versuchen
              </button>
              <button
                onClick={onClose}
                className="py-2 px-4 rounded-lg font-semibold text-gray-400 hover:text-[#D4AF37] transition border border-gray-600 hover:border-[#D4AF37]"
              >
                Schließen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
