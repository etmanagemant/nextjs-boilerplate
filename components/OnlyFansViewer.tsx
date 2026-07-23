"use client";

import { useEffect, useRef, useState } from "react";

async function interact(modelId: string, action: string, data: Record<string, unknown>) {
  const response = await fetch("/api/crm/interact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId, action, data }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Interact failed (${response.status})`);
  }
  return response.json();
}

interface OnlyFansViewerProps {
  modelId: string;
  modelName?: string;
  onClose: () => void;
  isModal?: boolean;
  isEmbedded?: boolean;
}

/**
 * OnlyFansViewer - Modal component for viewing OnlyFans streams
 * Can be used as a modal overlay or embedded viewer
 */
export function OnlyFansViewer({ 
  modelId, 
  modelName = "OnlyFans", 
  onClose, 
  isModal = false,
  isEmbedded = true
}: OnlyFansViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);
  const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch screenshot
  const fetchScreenshot = async () => {
    try {
      const response = await fetch(
        `/api/crm/screenshot?modelId=${encodeURIComponent(modelId)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch screenshot");
      }

      const data = await response.json();
      setLastScreenshot(data.screenshot);
      setError(null);

      // Draw on canvas
      if (canvasRef.current && data.screenshot) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current?.getContext("2d");
          if (ctx) {
            canvasRef.current!.width = img.width;
            canvasRef.current!.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
          setIsLoading(false);
        };
        img.src = `data:image/jpeg;base64,${data.screenshot}`;
      }
    } catch (err: any) {
      console.error("[VIEWER] Screenshot error:", err);
      setError(err.message);
      setIsLoading(false);
    }
  };

  // Start polling screenshots
  useEffect(() => {
    console.log("[VIEWER] Starting for model:", modelId);
    setIsLoading(true);
    setError(null);

    const initializeAndPoll = async () => {
      try {
        // The screenshot route transparently restores the session from saved
        // cookies if the VPS browser isn't running anymore, so we can just
        // start polling directly.
        await fetchScreenshot();

        if (screenshotIntervalRef.current) {
          clearInterval(screenshotIntervalRef.current);
        }
        screenshotIntervalRef.current = setInterval(() => {
          fetchScreenshot();
        }, 600);
      } catch (err: any) {
        console.error("[VIEWER] Initialization error:", err);
        setError(err.message || "Failed to initialize OnlyFans viewer");
        setIsLoading(false);
      }
    };

    initializeAndPoll();

    return () => {
      if (screenshotIntervalRef.current) {
        clearInterval(screenshotIntervalRef.current);
      }
    };
  }, [modelId]);

  // Handle canvas click
  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    setLastScreenshot(null);
    
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
    }

    const initializeAndPoll = async () => {
      try {
        await fetchScreenshot();

        if (screenshotIntervalRef.current) {
          clearInterval(screenshotIntervalRef.current);
        }
        screenshotIntervalRef.current = setInterval(() => {
          fetchScreenshot();
        }, 600);
      } catch (err: any) {
        console.error("[VIEWER] Retry error:", err);
        setError(err.message || "Failed to initialize OnlyFans viewer");
        setIsLoading(false);
      }
    };

    initializeAndPoll();
  };

  const handleRefreshSession = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch("/api/crm/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          action: "reload",
          data: { delay: 1500 },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to refresh session");
      }

      const data = await response.json();
      setLastScreenshot(data.screenshot);

      // Draw new screenshot
      if (canvasRef.current && data.screenshot) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current?.getContext("2d");
          if (ctx) {
            canvasRef.current!.width = img.width;
            canvasRef.current!.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
          setIsLoading(false);
        };
        img.src = `data:image/jpeg;base64,${data.screenshot}`;
      }
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Handle canvas click - scale from displayed CSS size to actual screenshot pixels
  const handleCanvasClick = async (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    try {
      const data = await interact(modelId, "click", { x, y });
      if (data.screenshot) {
        setLastScreenshot(data.screenshot);
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current?.getContext("2d");
          if (ctx) {
            canvasRef.current!.width = img.width;
            canvasRef.current!.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
        };
        img.src = `data:image/jpeg;base64,${data.screenshot}`;
      }
    } catch (err) {
      console.error("[VIEWER] Click error:", err);
    }

    hiddenInputRef.current?.focus();
  };

  // Forward keystrokes typed into the hidden input to whatever is focused on the live page
  const handleHiddenInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    event.target.value = "";
    if (text) interact(modelId, "keypress", { text }).catch((err) => console.error("[VIEWER] Type error:", err));
  };

  const handleHiddenKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "Tab" || event.key === "Backspace") {
      event.preventDefault();
      interact(modelId, "key", { key: event.key }).catch((err) => console.error("[VIEWER] Key error:", err));
    }
  };

  // Wrapper element (can be modal, embedded, or standalone)
  const viewerContent = (
    <div className="relative w-full h-full bg-gradient-to-br from-[#0A0A0A] to-[#050505] rounded-lg overflow-hidden border border-[#D4AF37]/10">
      {/* Header - Dark theme with Gold accents */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-[#0A0A0A] via-[#050505]/95 to-transparent p-4 flex items-center justify-between border-b border-[#D4AF37]/20">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👁️</span>
          <h3 className="text-[#F3E5AB] font-black text-lg uppercase tracking-wider">{modelName}</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchScreenshot}
            className="px-4 py-2 bg-gradient-to-b from-[#D4AF37]/80 to-[#AA7C11]/80 hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-bold rounded-lg text-sm transition shadow-lg hover:shadow-[#D4AF37]/30"
            title="Refresh screenshot"
          >
            📸 Refresh
          </button>
          <button
            onClick={handleRefreshSession}
            className="px-4 py-2 bg-gradient-to-b from-[#D4AF37]/60 to-[#AA7C11]/60 hover:from-[#D4AF37]/80 hover:to-[#AA7C11]/80 text-black font-bold rounded-lg text-sm transition shadow-lg"
            title="Reload page and refresh session"
          >
            🔄 Reload
          </button>
          {!isEmbedded && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gradient-to-b from-slate-600/80 to-slate-700/80 hover:from-slate-500 hover:to-slate-600 text-white font-bold rounded-lg text-sm transition shadow-lg"
              title="Close"
            >
              ✕ Close
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/60 to-[#0A0A0A]/80 z-10 backdrop-blur-sm">
          <div className="text-center">
            <div className="animate-spin mb-4 text-3xl">⏳</div>
            <p className="text-[#F3E5AB] font-bold text-lg">Laden...</p>
            <p className="text-slate-400 text-sm mt-2">OnlyFans Stream wird verbunden</p>
          </div>
        </div>
      )}

      {/* Error State - Enhanced styling */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/80 to-[#0A0A0A]/90 z-10 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-[#2D1A0A] to-[#1A0F05] border-2 border-[#D4AF37]/40 rounded-xl p-6 text-[#F3E5AB] max-w-2xl shadow-2xl">
            <p className="font-black mb-3 text-lg text-[#D4AF37] uppercase tracking-wider">⚠️ OnlyFans Stream Fehler</p>
            
            {/* Error Message */}
            <div className="bg-[#050505]/80 border border-[#D4AF37]/20 rounded-lg p-4 mb-4 text-sm font-mono text-slate-300">
              <p>{error}</p>
            </div>

            {/* Diagnostic Help */}
            <div className="text-xs text-slate-300 mb-4 border border-[#D4AF37]/20 rounded-lg p-4 bg-[#0A0A0A]/60">
              <p className="font-bold mb-3 text-[#D4AF37] uppercase tracking-wider">ℹ️ Debug-Info:</p>
              <ul className="list-disc list-inside space-y-2 text-slate-400">
                {error.includes("No active session") && (
                  <>
                    <li>Model ID: <span className="font-mono text-[#F3E5AB]">{modelId}</span></li>
                    <li>⚠️ Keine aktive Browserless-Session gefunden</li>
                    <li>👉 Lösung: Model in /management/crm-connect neu verbinden</li>
                  </>
                )}
                {error.includes("Session configuration missing") && (
                  <>
                    <li>Session existiert aber Konfiguration unvollständig</li>
                    <li>👉 Lösung: Model aktualisieren oder neu authentifizieren</li>
                  </>
                )}
                {error.includes("Bad Request") && (
                  <>
                    <li>Browserless API hat Request abgelehnt (HTTP 400)</li>
                    <li>Session may be invalid, expired, or corrupted</li>
                    <li>👉 Try: Click "Refresh Session" or reconnect model</li>
                    <li>👉 If issue persists: Go to /management/crm-connect and re-setup</li>
                  </>
                )}
                {error.includes("Authentication failed") && (
                  <>
                    <li>Browserless API authentication error (HTTP 401)</li>
                    <li>Server configuration issue - Contact admin</li>
                  </>
                )}
                {error.includes("Rate limited") && (
                  <>
                    <li>Too many requests to Browserless API</li>
                    <li>👉 Wait a moment and then retry</li>
                  </>
                )}
                {error.includes("Navigation failed") && (
                  <>
                    <li>Navigation zu OnlyFans fehlgeschlagen</li>
                    <li>Session könnte nicht richtig authentifiziert sein</li>
                    <li>👉 Lösung: Session aktualisieren oder Browser-Logs prüfen (F12)</li>
                  </>
                )}
                {!error.includes("No active session") && !error.includes("configuration") && !error.includes("Bad Request") && !error.includes("Authentication") && !error.includes("Rate limited") && !error.includes("Navigation") && (
                  <li>Unbekannter Fehler - Browser-Konsole (F12) für Details prüfen</li>
                )}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleRetry}
                className="flex-1 px-4 py-3 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-bold rounded-lg text-sm transition shadow-lg hover:shadow-[#D4AF37]/40"
              >
                🔄 Erneut versuchen
              </button>
              <button
                onClick={handleRefreshSession}
                className="flex-1 px-4 py-3 bg-gradient-to-b from-[#D4AF37]/70 to-[#AA7C11]/70 hover:from-[#D4AF37] hover:to-[#AA7C11] text-black font-bold rounded-lg text-sm transition shadow-lg"
              >
                🔗 Session aktualisieren
              </button>
              {isModal && (
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg text-sm transition shadow-lg"
                >
                  Schließen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Canvas - OnlyFans Stream with dark border */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-full object-contain cursor-pointer border-t border-[#D4AF37]/20"
        style={{ maxHeight: "100%" }}
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
  );

  // If modal mode, wrap in backdrop
  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl h-[90vh] rounded-xl overflow-hidden shadow-2xl border-2 border-[#D4AF37]/40 bg-[#050505]">
          {viewerContent}
        </div>
      </div>
    );
  }

  // If embedded mode, return full-size viewer (no padding/rounded)
  if (isEmbedded) {
    return (
      <div className="w-full h-full bg-[#0A0A0A] overflow-hidden border border-[#D4AF37]/20">
        {viewerContent}
      </div>
    );
  }

  // Otherwise return bare viewer with rounded corners
  return viewerContent;
}
