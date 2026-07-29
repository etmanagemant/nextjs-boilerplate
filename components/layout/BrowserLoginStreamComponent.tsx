"use client";

import React, { useEffect, useRef, useState } from "react";
import { loadRFB } from "@/lib/loadRfb";

interface BrowserLoginStreamComponentProps {
  modelId: string;
  modelName: string;
  onClose: () => void;
  onSuccess: () => void;
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
  const [pasteText, setPasteText] = useState("");
  const [pasteStatus, setPasteStatus] = useState<"idle" | "done" | "error">("idle");

  const vncContainerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  // CONFIRMED LIVE: crm_model_sessions.is_active only ever got set back to
  // true by the admin explicitly clicking "Creator verbinden" below - if a
  // session was already fine (still logged in from before, nothing to
  // actually confirm) and whoever reconnected just saw it working and
  // closed this modal, is_active stayed stuck false forever, even though
  // the real OnlyFans session was perfectly healthy. That silently broke
  // auto-reconnect on every subsequent restart (sessions-to-restore only
  // ever looks at is_active), making the SAME model need "reconnecting"
  // over and over. Auto-saving the instant a valid login is detected -
  // not waiting for a manual click - closes that gap; the button stays as
  // an explicit fallback/reassurance, not the only path to actually saving.
  const autoConfirmedRef = useRef(false);
  const loginStreakRef = useRef(0);

  // The login display's X11 keymap can end up mismatched with whatever
  // physical keyboard layout the admin's OS/browser is using (e.g. AltGr
  // combos for "@" on a German layout), and x11vnc resets its own keymap
  // handling on every restart regardless of what's configured server-side.
  // Clipboard paste sidesteps all of that: the admin types into a normal
  // local input (their own OS handles every character correctly), one
  // click pushes it into the remote session's clipboard via the VNC
  // protocol's native clipboard-sync feature, then a plain Ctrl+V (always
  // transmits fine, no special keysyms involved) pastes it into the field.
  const handlePasteToVnc = () => {
    if (!rfbRef.current || !pasteText) return;
    try {
      rfbRef.current.clipboardPasteFrom(pasteText);
      setPasteStatus("done");
      setTimeout(() => setPasteStatus("idle"), 1500);
    } catch (err) {
      console.error("[LOGIN-VIEW] clipboard paste failed:", err);
      setPasteStatus("error");
    }
  };

  // VNC has no concept of "logged in" - it's purely visual/input. This is
  // the only thing still polled for.
  // Deliberately NOT /api/crm/screenshot: that route also carries the CRM
  // Inbox's "this previously-working session looks expired, disconnect it"
  // logic, which has no way to know a fresh login is legitimately in
  // progress here (isLoggedIn:false while the admin is still filling out
  // the form is completely normal, not proof of anything expiring). Calling
  // it during an active login could auto-disconnect - i.e. kill - the exact
  // browser the admin is mid-login on, every ~2s, for as long as the form
  // takes to fill in. This dedicated status endpoint only ever reads state,
  // never mutates it.
  const checkLoginState = async () => {
    try {
      const res = await fetch(`/api/crm/browser-login/status?modelId=${encodeURIComponent(modelId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const loggedIn = !!data.isLoggedIn;
      setIsLoggedIn(loggedIn);
      // CONFIRMED LIVE (2026-07-29): a single loggedIn:true tick isn't
      // reliable enough to auto-save on - if the login page itself
      // reloads mid-typing (OnlyFans' own redirect/challenge, unrelated
      // to anything typed), there's a brief moment where the password
      // field hasn't rendered back in yet, which the VPS-side heuristic
      // can misread as "logged in" for exactly one poll. Requiring 2
      // consecutive true reads (4s apart) filters that transient blip
      // without meaningfully delaying a genuine login.
      if (loggedIn) {
        loginStreakRef.current += 1;
      } else {
        loginStreakRef.current = 0;
      }
      if (loginStreakRef.current >= 2 && !autoConfirmedRef.current) {
        autoConfirmedRef.current = true;
        handleConfirm();
      }
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
    // Default (6) favors per-frame sharpness over update rate - fine for
    // mostly-static chat UI, but noticeably choppy for actual video
    // playback inside OnlyFans, which is CPU-decoded/re-encoded frame by
    // frame with no hardware acceleration on this VPS. Trading a bit of
    // sharpness for a higher achievable frame rate; VNC still can't match
    // native video smoothness (it's a screen-share protocol, not built
    // for motion content), but this is a real, low-risk improvement.
    rfb.qualityLevel = 4;
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
      // Let the next poll tick auto-retry instead of staying stuck - this
      // was only ever a transient network/API hiccup, not a real login
      // problem (isLoggedIn was already confirmed true to get here).
      autoConfirmedRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] border border-[#C9A86A]/30 rounded-lg shadow-2xl w-[98vw] max-w-[1900px] p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-[#C9A86A] flex items-center gap-2">
              🌐 Live Browser-Login
              {phase === "live" && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  🟢 VNC live
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              <span className="font-bold text-[#C9A86A]">Model:</span> {modelName}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-[#C9A86A] transition text-xl">
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

            {phase === "live" && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Sonderzeichen wie @ hier eingeben (mit deiner normalen Tastatur)..."
                  className="flex-1 bg-black/50 border border-[#C9A86A]/30 rounded px-3 py-1.5 text-sm text-[#E2C48A] placeholder:text-slate-500 focus:outline-none focus:border-[#C9A86A]"
                />
                <button
                  onClick={handlePasteToVnc}
                  disabled={!pasteText}
                  className="py-1.5 px-3 rounded text-xs font-bold bg-[#C9A86A]/20 border border-[#C9A86A]/50 text-[#C9A86A] hover:bg-[#C9A86A]/30 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                >
                  {pasteStatus === "done" ? "✓ Kopiert" : pasteStatus === "error" ? "✗ Fehler" : "📋 Übertragen"}
                </button>
              </div>
            )}
            {phase === "live" && pasteStatus === "done" && (
              <p className="text-[10px] text-emerald-400 mb-2 -mt-1">
                In Zwischenablage übertragen — klicke jetzt in das Feld im Fenster unten und drücke Strg+V zum Einfügen.
              </p>
            )}

            <div
              className="relative bg-black rounded-lg overflow-hidden border border-[#C9A86A]/30"
              style={{ height: "85vh" }}
            >
              <div ref={vncContainerRef} className="w-full h-full" />
              {(phase === "opening" || phase === "connecting") && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                  <div className="animate-spin mb-4">
                    <div className="w-8 h-8 border-4 border-[#C9A86A] border-t-transparent rounded-full"></div>
                  </div>
                  <p className="text-[#C9A86A] font-semibold">
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
                className="py-2 px-4 rounded-lg font-bold bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] text-black hover:from-[#E2C48A] transition"
              >
                🔄 Erneut versuchen
              </button>
              <button
                onClick={onClose}
                className="py-2 px-4 rounded-lg font-semibold text-gray-400 hover:text-[#C9A86A] transition border border-gray-600 hover:border-[#C9A86A]"
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
