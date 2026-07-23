"use client";

import React, { useEffect, useRef, useState } from "react";

interface BrowserLoginStreamComponentProps {
  modelId: string;
  modelName: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Opens a live, click-and-type-able view of a real headful browser running
 * on the VPS, so the admin can actually log in to OnlyFans. Once a valid
 * session is detected, shows "Creator verbinden" to persist the cookies.
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  // Keystrokes/clicks used to fire as independent parallel requests, which
  // could land on the VPS out of order and garble what you typed. Chain
  // them on this queue so each one waits for the previous to finish first.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const drawScreenshot = (base64OrDataUrl: string) => {
    if (!canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = base64OrDataUrl.startsWith("data:") ? base64OrDataUrl : `data:image/jpeg;base64,${base64OrDataUrl}`;
  };

  const fetchFrame = async () => {
    try {
      const res = await fetch(`/api/crm/screenshot?modelId=${encodeURIComponent(modelId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.screenshot) drawScreenshot(data.screenshot);
      setIsLoggedIn(!!data.isLoggedIn);
    } catch (err) {
      console.error("[LOGIN-VIEW] frame error:", err);
    }
  };

  const interact = (action: string, data: Record<string, unknown>) => {
    // Queue this call after whatever's currently in flight, so rapid typing
    // or click-then-type doesn't send overlapping/out-of-order requests.
    const run = async () => {
      try {
        const res = await fetch("/api/crm/interact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, action, data }),
        });
        if (!res.ok) return;
        const result = await res.json();
        if (result.screenshot) drawScreenshot(result.screenshot);
        setIsLoggedIn(!!result.isLoggedIn);
      } catch (err) {
        console.error("[LOGIN-VIEW] interact error:", err);
      }
    };
    queueRef.current = queueRef.current.then(run);
    return queueRef.current;
  };

  // Step 1: open the live browser on the VPS
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
        pollRef.current = setInterval(fetchFrame, 600);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    interact("click", { x, y });
    hiddenInputRef.current?.focus();
  };

  // Forward every keystroke typed into the hidden input to the live page
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
      <div className="bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] border border-[#D4AF37]/30 rounded-lg shadow-2xl max-w-3xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-[#D4AF37]">🌐 Live Browser-Login</h2>
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
            <div className="relative bg-black rounded-lg overflow-hidden border border-[#D4AF37]/30">
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="w-full h-auto max-h-[60vh] object-contain cursor-pointer block mx-auto"
              />
              {/* Invisible input that captures keystrokes and forwards them to the live page */}
              <input
                ref={hiddenInputRef}
                type="text"
                onChange={handleHiddenInput}
                onKeyDown={handleHiddenKeyDown}
                className="absolute -left-[9999px] w-1 h-1 opacity-0"
                autoComplete="off"
              />
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
