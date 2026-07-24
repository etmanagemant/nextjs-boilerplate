"use client";

import React, { useEffect, useRef, useState } from "react";
import { mapClickToCanvasCoords } from "@/lib/canvasClick";

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
 * Opens a live, click-and-type-able view of a real headful browser running
 * on the VPS, so the admin can actually log in to OnlyFans. Once a valid
 * session is detected, shows "Creator verbinden" to persist the cookies.
 *
 * Primary path: a real VNC connection (noVNC) to a dedicated display on the
 * VPS - genuine remote-desktop control (native input forwarding built into
 * the protocol, no custom click/keyboard relay needed) instead of
 * screenshot polling, which is what made typing/clicking - especially
 * CAPTCHAs - feel many seconds delayed. Falls back to the original
 * poll-a-screenshot approach if VNC can't connect for any reason (e.g. a
 * network blocking the WebSocket) - that path is proven, if slower.
 */
export default function BrowserLoginStreamComponent({
  modelId,
  modelName,
  onClose,
  onSuccess,
}: BrowserLoginStreamComponentProps) {
  const [phase, setPhase] = useState<"opening" | "live" | "confirming" | "error">("opening");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string>("");
  const [vncActive, setVncActive] = useState(false);

  const vncContainerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  // Keystrokes/clicks used to fire as independent parallel requests, which
  // could land on the VPS out of order and garble what you typed. Chain
  // them on this queue so each one waits for the previous to finish first.
  // Only used by the poll+canvas fallback - VNC forwards input natively.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const frameSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);

  const drawScreenshot = (base64OrDataUrl: string, seq: number) => {
    if (!canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      if (seq < appliedSeqRef.current) return;
      appliedSeqRef.current = seq;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = base64OrDataUrl.startsWith("data:") ? base64OrDataUrl : `data:image/jpeg;base64,${base64OrDataUrl}`;
  };

  // Doubles as the login-state check (isLoggedIn) regardless of whether
  // VNC or the fallback is active - VNC has no concept of that, it's purely
  // visual/input. Only draws to the fallback canvas when VNC isn't active.
  const fetchFrame = async () => {
    const seq = ++frameSeqRef.current;
    try {
      const res = await fetch(`/api/crm/screenshot?modelId=${encodeURIComponent(modelId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!vncActive && data.screenshot) drawScreenshot(data.screenshot, seq);
      setIsLoggedIn(!!data.isLoggedIn);
    } catch (err) {
      console.error("[LOGIN-VIEW] frame error:", err);
    }
  };

  const interact = (action: string, data: Record<string, unknown>) => {
    const run = async () => {
      const seq = ++frameSeqRef.current;
      try {
        const res = await fetch("/api/crm/interact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, action, data }),
        });
        if (!res.ok) return;
        const result = await res.json();
        if (!vncActive && result.screenshot) drawScreenshot(result.screenshot, seq);
        setIsLoggedIn(!!result.isLoggedIn);
      } catch (err) {
        console.error("[LOGIN-VIEW] interact error:", err);
      }
    };
    queueRef.current = queueRef.current.then(run);
    return queueRef.current;
  };

  // Step 1: open the live browser on the VPS, then try VNC before falling
  // back to the poll+canvas approach.
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
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
        if (cancelled) return;

        setPhase("live");
        await fetchFrame();
        pollRef.current = setInterval(fetchFrame, 300);

        // Try VNC. If anything here throws or the connection doesn't
        // announce itself within a few seconds, vncActive just stays false
        // and the poll+canvas view (already running above) carries on.
        try {
          const [RFB, vncInfoRes] = await Promise.all([
            loadRFB(),
            fetch("/api/crm/browser-login/vnc-info"),
          ]);
          if (cancelled) return;
          if (!vncInfoRes.ok) throw new Error("VNC info unavailable");
          const { wsUrl, password } = await vncInfoRes.json();
          if (cancelled || !vncContainerRef.current || !wsUrl) return;

          const rfb = new RFB(vncContainerRef.current, wsUrl, {
            credentials: { password },
          });
          rfb.scaleViewport = true;
          rfb.resizeSession = false;
          rfbRef.current = rfb;

          rfb.addEventListener("connect", () => {
            if (!cancelled) setVncActive(true);
          });
          rfb.addEventListener("disconnect", (e: any) => {
            console.warn("[LOGIN-VIEW] VNC disconnected:", e?.detail);
            if (!cancelled) setVncActive(false);
          });
          rfb.addEventListener("securityfailure", (e: any) => {
            console.warn("[LOGIN-VIEW] VNC auth failed:", e?.detail);
          });
        } catch (vncErr: any) {
          console.warn("[LOGIN-VIEW] VNC unavailable, using poll+canvas fallback:", vncErr?.message);
        }

        // Focus immediately so the admin can start typing without first
        // having to click into the fallback canvas (VNC grabs its own
        // focus once connected).
        hiddenInputRef.current?.focus();
      } catch (err: any) {
        if (!cancelled) {
          setPhase("error");
          setError(err.message || "Unbekannter Fehler beim Starten");
        }
      }
    };

    start();

    return () => {
      cancelled = true;
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

  // Once VNC is confirmed active, the poll is only needed for the login-
  // state check, not visuals - slow it down since there's no longer a
  // canvas to keep redrawing.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchFrame, vncActive ? 2000 : 300);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vncActive, modelId]);

  // Fallback-only input handling - VNC forwards clicks/keys/scroll natively,
  // none of this runs while vncActive.
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const mapped = mapClickToCanvasCoords(e.clientX, e.clientY, canvasRef.current);
    if (!mapped) {
      hiddenInputRef.current?.focus();
      return;
    }
    interact("click", mapped);
    hiddenInputRef.current?.focus();
  };

  const handleHiddenInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    e.target.value = "";
    if (text) interact("keypress", { text });
  };

  const handleHiddenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab" || e.key === "Backspace") {
      e.preventDefault();
      interact("key", { key: e.key });
    }
  };

  useEffect(() => {
    if (vncActive) return; // VNC forwards scroll natively
    const canvas = canvasRef.current;
    if (!canvas) return;

    let accumulated = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (rawEvent: Event) => {
      const e = rawEvent as WheelEvent;
      e.preventDefault();
      accumulated += e.deltaY;
      if (timer) return;
      timer = setTimeout(() => {
        const amount = accumulated;
        accumulated = 0;
        timer = null;
        interact("scroll", { amount });
      }, 80);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      if (timer) clearTimeout(timer);
    };
  }, [modelId, vncActive]);

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
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    vncActive
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}
                  title={vncActive ? "Echte VNC-Verbindung aktiv" : "Fallback: Bild wird alle 300ms abgefragt"}
                >
                  {vncActive ? "🟢 VNC live" : "🟡 Poll-Modus"}
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

        {phase === "opening" && (
          <div className="aspect-video flex flex-col items-center justify-center bg-black/60 rounded-lg border border-[#D4AF37]/20">
            <div className="animate-spin mb-4">
              <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
            </div>
            <p className="text-[#D4AF37] font-semibold">Browser wird gestartet...</p>
          </div>
        )}

        {(phase === "live" || phase === "confirming") && (
          <>
            <p className="text-xs text-slate-400 mb-2">
              Klicke in das Fenster und logge dich mit den Model-Zugangsdaten bei OnlyFans ein. Klicken fokussiert Felder, danach kannst du direkt tippen.
            </p>
            <div className="relative bg-black rounded-lg overflow-hidden border border-[#D4AF37]/30" style={{ height: "70vh" }}>
              {/* VNC attaches its own canvas into this div once connected */}
              <div ref={vncContainerRef} className="w-full h-full" style={{ display: vncActive ? "block" : "none" }} />
              {!vncActive && (
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className="w-full h-full object-contain cursor-pointer block mx-auto"
                />
              )}
              {/* Invisible input that captures keystrokes for the fallback path only */}
              {!vncActive && (
                <input
                  ref={hiddenInputRef}
                  type="text"
                  onChange={handleHiddenInput}
                  onKeyDown={handleHiddenKeyDown}
                  className="absolute -left-[9999px] w-1 h-1 opacity-0"
                  autoComplete="off"
                />
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
            <button
              onClick={onClose}
              className="py-2 px-4 rounded-lg font-semibold text-gray-400 hover:text-[#D4AF37] transition border border-gray-600 hover:border-[#D4AF37]"
            >
              Schließen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
