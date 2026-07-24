"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { mapClickToRenderedElement } from "@/lib/canvasClick";

// Keystrokes/clicks used to fire as independent parallel requests, which
// could land on the VPS out of order and garble what's typed. Chain calls
// per model on this queue so each one waits for the previous to finish.
const interactQueues = new Map<string, Promise<unknown>>();

function interact(modelId: string, action: string, data: Record<string, unknown>) {
  const run = async () => {
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
  };

  const queued = (interactQueues.get(modelId) || Promise.resolve()).then(run, run);
  interactQueues.set(modelId, queued.catch(() => {}));
  return queued;
}

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
 * OnlyFansViewer - Modal component for viewing OnlyFans streams
 * Can be used as a modal overlay or embedded viewer
 *
 * Renders the live MJPEG stream (see /api/crm/stream-url + the VPS's
 * /stream route) as the primary view - a continuous pushed video feed
 * instead of the old poll-one-screenshot-per-request approach, which made
 * typing and especially CAPTCHA-solving feel like a slideshow. The old
 * poll+canvas path is kept as an automatic fallback (rendered whenever the
 * stream hasn't loaded) since it's proven and this is new, unverified-live
 * code - if the stream never loads (VPS unreachable directly, blocked,
 * etc.) the viewer just keeps working the way it always did.
 */
export function OnlyFansViewer({
  modelId,
  modelName = "OnlyFans",
  onClose,
  isModal = false,
  isEmbedded = true,
  emojis = DEFAULT_EMOJIS,
}: OnlyFansViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // The background poll and click/keypress-triggered redraws all fetch and
  // draw independently. A slow poll response landing after a newer
  // keystroke's response would paint a stale frame over it, making it look
  // like typing didn't register. Tag every request with a sequence number
  // at dispatch time and only ever draw the newest one that arrives.
  const frameSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamOk, setStreamOk] = useState(false);
  const streamRetriesRef = useRef(0);

  const drawScreenshot = (base64: string, seq: number) => {
    if (!canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      if (seq < appliedSeqRef.current) return;
      appliedSeqRef.current = seq;
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        canvasRef.current!.width = img.width;
        canvasRef.current!.height = img.height;
        ctx.drawImage(img, 0, 0);
      }
      setIsLoading(false);
    };
    img.src = `data:image/jpeg;base64,${base64}`;
  };

  // Fetch screenshot - also doubles as the session health check (expired /
  // needs-restore detection), which the raw MJPEG stream has no concept of,
  // so this keeps running even once the stream is live (just much less
  // often, since it's no longer needed for visual updates then).
  const fetchScreenshot = async () => {
    const seq = ++frameSeqRef.current;
    try {
      const response = await fetch(
        `/api/crm/screenshot?modelId=${encodeURIComponent(modelId)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch screenshot");
      }

      const data = await response.json();

      if (data.sessionExpired) {
        setSessionExpired(true);
        setIsLoading(false);
        if (screenshotIntervalRef.current) {
          clearInterval(screenshotIntervalRef.current);
        }
        return;
      }

      setError(null);
      if (data.screenshot) drawScreenshot(data.screenshot, seq);
    } catch (err: any) {
      console.error("[VIEWER] Screenshot error:", err);
      setError(err.message);
      setIsLoading(false);
    }
  };

  const refreshStreamUrl = () => {
    fetch(`/api/crm/stream-url?modelId=${encodeURIComponent(modelId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.streamUrl) setStreamUrl(data.streamUrl);
      })
      .catch(() => {
        /* stream stays off, poll+canvas fallback carries the view */
      });
  };

  const handleStreamError = () => {
    setStreamOk(false);
    streamRetriesRef.current += 1;
    if (streamRetriesRef.current > 5) {
      // Give up on streaming for this mount - the poll+canvas fallback
      // (already running) keeps the view working.
      setStreamUrl(null);
      return;
    }
    // The token behind the failed connection was single-use - mint a fresh
    // one before retrying.
    refreshStreamUrl();
  };

  // Initial health check + start trying to open the live stream.
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setSessionExpired(false);
    setStreamUrl(null);
    setStreamOk(false);
    streamRetriesRef.current = 0;

    fetchScreenshot();
    refreshStreamUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  // Poll interval: fast (250ms) until the stream takes over, then slows to
  // a 3s health-only check once streamOk - running both at full speed would
  // double the VPS's screenshot-encoding load for no visible benefit, since
  // the stream already handles visual updates at that point.
  useEffect(() => {
    if (screenshotIntervalRef.current) clearInterval(screenshotIntervalRef.current);
    screenshotIntervalRef.current = setInterval(fetchScreenshot, streamOk ? 3000 : 250);
    return () => {
      if (screenshotIntervalRef.current) clearInterval(screenshotIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamOk, modelId]);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    streamRetriesRef.current = 0;
    fetchScreenshot();
    refreshStreamUrl();
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
      if (data.screenshot) drawScreenshot(data.screenshot, ++frameSeqRef.current);
      else setIsLoading(false);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Shared click handler for whichever element is currently visible (the
  // streamed <img> once it's up, the polled <canvas> as fallback until
  // then). Maps CSS position to actual frame pixels, accounting for
  // object-contain letterboxing (see lib/canvasClick.ts).
  const performClick = async (
    clientX: number,
    clientY: number,
    el: HTMLCanvasElement | HTMLImageElement,
    intrinsicWidth: number,
    intrinsicHeight: number
  ) => {
    const mapped = mapClickToRenderedElement(clientX, clientY, el, intrinsicWidth, intrinsicHeight);
    if (!mapped) {
      hiddenInputRef.current?.focus();
      return;
    }

    const seq = ++frameSeqRef.current;
    try {
      const data = await interact(modelId, "click", mapped);
      // Only need to hand-draw the response when there's no live stream
      // doing that automatically.
      if (!streamOk && data.screenshot) drawScreenshot(data.screenshot, seq);
    } catch (err) {
      console.error("[VIEWER] Click error:", err);
    }

    hiddenInputRef.current?.focus();
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    performClick(event.clientX, event.clientY, canvasRef.current, canvasRef.current.width, canvasRef.current.height);
  };

  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    performClick(event.clientX, event.clientY, imgRef.current, imgRef.current.naturalWidth, imgRef.current.naturalHeight);
  };

  // Forward keystrokes typed into the hidden input to whatever is focused on
  // the live page. Only need to hand-draw the response when there's no live
  // stream already showing it - otherwise waiting on that draw just adds
  // needless work.
  const handleHiddenInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    event.target.value = "";
    if (!text) return;
    const seq = ++frameSeqRef.current;
    interact(modelId, "keypress", { text })
      .then((data) => !streamOk && data.screenshot && drawScreenshot(data.screenshot, seq))
      .catch((err) => console.error("[VIEWER] Type error:", err));
  };

  const handleHiddenKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "Tab" || event.key === "Backspace") {
      event.preventDefault();
      const seq = ++frameSeqRef.current;
      interact(modelId, "key", { key: event.key })
        .then((data) => !streamOk && data.screenshot && drawScreenshot(data.screenshot, seq))
        .catch((err) => console.error("[VIEWER] Key error:", err));
    }
  };

  // Inserts an emoji into whatever field is currently focused on the live
  // OnlyFans page - click into the message box first, then tap an emoji here.
  const handleEmojiClick = (emoji: string) => {
    const seq = ++frameSeqRef.current;
    interact(modelId, "keypress", { text: emoji })
      .then((data) => !streamOk && data.screenshot && drawScreenshot(data.screenshot, seq))
      .catch((err) => console.error("[VIEWER] Emoji error:", err));
  };

  // There was no way to scroll the live page at all before this - a mouse
  // wheel over the view did nothing, so any list longer than one screen
  // (fan list, category list, chat history) was completely unreachable, and
  // clicks based on a scroll position the real page was never actually at
  // would land on the wrong row. Uses a native (non-passive) listener
  // because React's synthetic onWheel is passive by default and can't
  // preventDefault to stop the CRM page itself from scrolling instead of
  // the embedded view. Wheel events fire dozens of times per gesture, so
  // accumulate and send at most once per 80ms. Attached to whichever
  // element is currently mounted (img or canvas).
  useEffect(() => {
    const el: HTMLElement | null = streamUrl && streamOk ? imgRef.current : canvasRef.current;
    if (!el) return;

    let accumulated = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (rawEvent: Event) => {
      const event = rawEvent as WheelEvent;
      event.preventDefault();
      accumulated += event.deltaY;
      if (timer) return;
      timer = setTimeout(() => {
        const amount = accumulated;
        accumulated = 0;
        timer = null;
        const seq = ++frameSeqRef.current;
        interact(modelId, "scroll", { amount })
          .then((data) => !streamOk && data.screenshot && drawScreenshot(data.screenshot, seq))
          .catch((err) => console.error("[VIEWER] Scroll error:", err));
      }, 80);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timer) clearTimeout(timer);
    };
  }, [modelId, streamUrl, streamOk]);

  // Wrapper element (can be modal, embedded, or standalone)
  const viewerContent = (
    <div className="relative w-full h-full bg-gradient-to-br from-[#0A0A0A] to-[#050505] rounded-lg overflow-hidden border border-[#D4AF37]/10">
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

      {/* Session Expired - OnlyFans invalidated the login (e.g. platform update) */}
      {sessionExpired && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/80 to-[#0A0A0A]/90 z-20 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-[#2D1A0A] to-[#1A0F05] border-2 border-[#D4AF37]/40 rounded-xl p-6 text-[#F3E5AB] max-w-md shadow-2xl text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="font-black mb-2 text-lg text-[#D4AF37] uppercase tracking-wider">Session abgelaufen</p>
            <p className="text-sm text-slate-300 mb-5">
              OnlyFans hat diese Session ungültig gemacht (z. B. durch ein Update oder erzwungenen Logout).
              Das Model muss neu verbunden werden.
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

      {/* Error State - Enhanced styling */}
      {error && !sessionExpired && (
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
                className="flex-1 px-4 py-3 bg-gradient-to-b from-[#D4AF37] to-[#8A6D3F] hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-bold rounded-lg text-sm transition shadow-lg hover:shadow-[#D4AF37]/40"
              >
                🔄 Erneut versuchen
              </button>
              <button
                onClick={handleRefreshSession}
                className="flex-1 px-4 py-3 bg-gradient-to-b from-[#D4AF37]/70 to-[#8A6D3F]/70 hover:from-[#D4AF37] hover:to-[#8A6D3F] text-black font-bold rounded-lg text-sm transition shadow-lg"
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

      {/* Live MJPEG stream (primary) or polled canvas (fallback until the
          stream loads, or permanently if it never does) */}
      {streamUrl ? (
        <img
          ref={imgRef}
          src={streamUrl}
          onLoad={() => {
            setStreamOk(true);
            setIsLoading(false);
          }}
          onError={handleStreamError}
          onClick={handleImageClick}
          className="w-full h-full object-contain cursor-pointer border-t border-[#D4AF37]/20"
          style={{ maxHeight: "100%" }}
          alt="OnlyFans Live-Ansicht"
        />
      ) : (
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-full object-contain cursor-pointer border-t border-[#D4AF37]/20"
          style={{ maxHeight: "100%" }}
        />
      )}

      {/* Invisible input that captures keystrokes and forwards them to the live page */}
      <input
        ref={hiddenInputRef}
        type="text"
        onChange={handleHiddenInput}
        onKeyDown={handleHiddenKeyDown}
        className="absolute -left-[9999px] w-1 h-1 opacity-0"
        autoComplete="off"
      />

      {/* Small mode indicator - lets us actually see whether the live stream
          is active or it fell back to the polled view, instead of guessing
          from how smooth it feels. */}
      {!isLoading && (
        <div
          className={`absolute top-2 right-2 z-20 text-[10px] font-bold px-2 py-0.5 rounded-full ${
            streamOk ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
          }`}
          title={streamOk ? "Live-Stream aktiv" : "Fallback: Bild wird alle 250ms abgefragt"}
        >
          {streamOk ? "🟢 Live" : "🟡 Poll-Modus"}
        </div>
      )}

      {/* Smiley bar overlay - floats over the live OnlyFans message box.
          Click into the chat field first, then tap an emoji to insert it. */}
      {!isLoading && !error && !sessionExpired && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] overflow-x-auto flex gap-1.5 px-3 py-2 rounded-full bg-black/80 border border-[#D4AF37]/40 backdrop-blur-sm shadow-2xl">
          {emojis.map((emoji, i) => (
            <button
              key={i}
              onClick={() => handleEmojiClick(emoji)}
              className="text-lg leading-none flex-shrink-0 hover:scale-125 transition-transform cursor-pointer"
              title="In OnlyFans-Chat einfügen"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
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
