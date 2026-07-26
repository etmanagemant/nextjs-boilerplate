"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadRFB } from "@/lib/loadRfb";
import { FanCrmPanel } from "@/components/FanCrmPanel";
import { ModelNotesPanel } from "@/components/ModelNotesPanel";
import EmojiPicker from "@/components/layout/EmojiPicker";
import { updateChatterEmojis } from "@/app/management/crm-connect/actions";

interface OnlyFansViewerProps {
  modelId: string;
  modelName?: string;
  onClose: () => void;
  isModal?: boolean;
  isEmbedded?: boolean;
  emojis?: string[];
  onEmojisChange?: (emojis: string[]) => void;
  chatterId?: string;
  userRole?: string;
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
  onEmojisChange,
  chatterId,
  userRole = "chatter",
}: OnlyFansViewerProps) {
  const isAdmin = userRole === "admin";
  const [phase, setPhase] = useState<"connecting" | "live" | "no-session" | "error">("connecting");
  const [error, setError] = useState("");
  const [pasteStatus, setPasteStatus] = useState<"idle" | "done">("idle");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const vncContainerRef = useRef<HTMLDivElement>(null);
  const viewerOuterRef = useRef<HTMLDivElement>(null);
  const [videoDims, setVideoDims] = useState<{ width: number; height: number } | null>(null);
  const rfbRef = useRef<any>(null);
  const noSessionPollRef = useRef<NodeJS.Timeout | null>(null);
  const noSessionSyncedRef = useRef(false);
  const unmountedRef = useRef(false);

  const [currentFan, setCurrentFan] = useState<{ fanId: string; metadata: any; lastEditedBy: string | null } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [textareaTop, setTextareaTop] = useState<number | null>(null);
  const fanPollRef = useRef<NodeJS.Timeout | null>(null);

  // Assigns (or reuses) this user's own independent chatter slot for this
  // model - its own Chrome window on its own virtual display, so two
  // chatters working the same model at once don't share one cursor/scroll
  // position. The VPS has no concept of "logged in yet" here either (and
  // no slot to assign) until a live model session exists at all, so this
  // doubles as the "is anything connected" check and keeps retrying every
  // few seconds instead of checking once: a chatter can easily open CRM
  // Inbox before the admin has finished connecting via the Connection Hub,
  // and without a retry this would otherwise show "not connected" forever
  // even once a real session exists moments later.
  const waitForSession = async (): Promise<void> => {
    const slotRes = await fetch("/api/crm/chatter-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });
    const slotData = slotRes.ok ? await slotRes.json() : {};

    if (slotData.status !== "success" || !slotData.wsUrl) {
      // The VPS browser can disappear for reasons that have nothing to do
      // with the admin explicitly disconnecting (a VPS deploy/restart, a
      // crash, the idle timeout) - Supabase's is_active flag has no way to
      // learn that on its own, so without this the Connection Hub keeps
      // showing "verbunden" for a model that's actually completely dead.
      // Only fire once per no-session streak, not on every retry tick.
      // keepCookies: true - CONFIRMED LIVE this raced the VPS's own
      // autoReconnectAllModels() right after a restart: it silently
      // restores the model from these exact stored cookies, but this
      // check can still see "no session" for the first moment or two
      // while the chatter's own slot browser is still spinning up, and
      // wiping the cookies here would mean auto-reconnect only ever
      // works once. is_active still flips to false either way, so
      // Connection Hub still shows the honest "not connected" state.
      if (!noSessionSyncedRef.current) {
        noSessionSyncedRef.current = true;
        fetch("/api/crm/browser-login/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, keepCookies: true }),
        }).catch(() => {});
      }
      setPhase("no-session");
      if (!unmountedRef.current) {
        noSessionPollRef.current = setTimeout(() => {
          waitForSession().catch((err) => {
            setPhase("error");
            setError(err.message || "Unbekannter Fehler beim Verbinden");
          });
        }, 4000);
      }
      return;
    }

    noSessionSyncedRef.current = false;
    await connectVnc(slotData.wsUrl, slotData.password);
  };

  const connectVnc = async (wsUrl: string, password: string): Promise<void> => {
    const RFB = await loadRFB();
    if (!vncContainerRef.current) throw new Error("VNC-Verbindung konnte nicht eingerichtet werden");

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
      await waitForSession();
    } catch (err: any) {
      setPhase("error");
      setError(err.message || "Unbekannter Fehler beim Verbinden");
    }
  };

  // Detects which fan conversation is currently open inside the VNC view
  // (there's no other way for this app to know - that all happens directly
  // on OnlyFans' own page) so the Fan CRM panel can show/save the right
  // fan's data, and switches automatically when the chatter opens a
  // different chat inside OnlyFans itself.
  const pollCurrentFan = async () => {
    try {
      const res = await fetch(`/api/crm/current-fan?modelId=${encodeURIComponent(modelId)}`);
      const data = res.ok ? await res.json() : {};
      setModalOpen(!!data.modalOpen);
      setTextareaTop(typeof data.textareaTop === "number" ? data.textareaTop : null);
      if (data.status === "success" && data.fanId) {
        setCurrentFan({ fanId: data.fanId, metadata: data.metadata, lastEditedBy: data.lastEditedBy || null });
      } else {
        setCurrentFan(null);
      }
    } catch {
      /* keep whatever was last known rather than flicker the panel away on a single failed poll */
    }
  };

  useEffect(() => {
    if (phase !== "live") return;
    pollCurrentFan();
    // 1s, not 3s - opening a chat and waiting up to 3s for the panel to
    // show up read as sluggish/broken.
    fanPollRef.current = setInterval(pollCurrentFan, 1000);
    return () => {
      if (fanPollRef.current) clearInterval(fanPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, modelId]);

  useEffect(() => {
    unmountedRef.current = false;
    start();
    return () => {
      unmountedRef.current = true;
      if (noSessionPollRef.current) clearTimeout(noSessionPollRef.current);
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

  // Computes the video's pixel size in JS instead of leaving it to CSS
  // aspect-ratio - reported live as a persistent thin vertical line in the
  // VNC feed that no server-side/page-content fix touched, and that never
  // showed up in a direct screenshot of the actual remote page (only in
  // the rendered VNC view) - a hallmark of scaling a bitmap canvas to a
  // FRACTIONAL pixel size (e.g. 1189.92px), which is exactly what
  // aspect-ratio produces from an arbitrary container height. noVNC's
  // scaleViewport scales the fixed 1280x800 remote framebuffer to
  // whatever CSS size the container resolves to; rounding both dimensions
  // to whole pixels here keeps that scale factor's rounding consistent
  // instead of leaving it to the browser.
  useEffect(() => {
    const outer = viewerOuterRef.current;
    if (!outer) return;
    const recompute = () => {
      const h = Math.floor(outer.clientHeight);
      if (h <= 0) return;
      const w = Math.floor((h * 1280) / 800);
      setVideoDims({ width: w, height: Math.floor((w * 800) / 1280) });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  // Inserts straight into the real OnlyFans compose box via the chatter's
  // own slot (server-side Puppeteer focus + keyboard.insertText) - used to
  // go through VNC clipboard-paste + a manual Strg+V, which the direct
  // route makes unnecessary now that the compose box's real selector is
  // known.
  const handlePasteEmoji = async (emoji: string) => {
    try {
      const res = await fetch("/api/crm/insert-emoji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, emoji }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setPasteStatus("done");
        setTimeout(() => setPasteStatus("idle"), 900);
      } else {
        console.warn("[VIEWER] Emoji insert failed:", data);
      }
    } catch (err) {
      console.error("[VIEWER] Emoji insert error:", err);
    }
  };

  const handleToggleQuickEmoji = async (emoji: string) => {
    if (!chatterId || !onEmojisChange) return;
    const next = emojis.includes(emoji)
      ? emojis.filter((e) => e !== emoji)
      : [...emojis, emoji];
    onEmojisChange(next);
    try {
      await updateChatterEmojis(chatterId, next);
    } catch (err) {
      console.error("Failed to save quick emojis:", err);
    }
  };

  // Constrained to its own aspect ratio (matching the remote 1280x800
  // display) instead of stretching to fill whatever width is left over -
  // a VNC feed can only scale proportionally or distort, never reflow like
  // a native page, so letting it stretch into a much wider container just
  // left dead gray bars on both sides. Sized to the available height and
  // centered; the space this reclaims on wide screens is exactly what the
  // Fan CRM panel below now uses instead of sitting empty.
  const videoArea = (
    <div
      // Border on 3 sides only, deliberately not the right edge - that's
      // the side touching the Fan CRM panel, and a border there read as a
      // seam between "the real site" and "our overlay" instead of one
      // integrated view. The other 3 sides keep their frame.
      className="relative bg-gradient-to-br from-[#0A0A0A] to-[#050505] overflow-hidden border-t border-l border-b border-[#C9A86A]/10 rounded-l-lg"
      style={
        videoDims
          ? { width: videoDims.width, height: videoDims.height, flexShrink: 0 }
          : { aspectRatio: "1280 / 800", height: "100%" }
      }
    >
      {phase === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/60 to-[#0A0A0A]/80 z-10 backdrop-blur-sm">
          <div className="text-center">
            <div className="animate-spin mb-4 text-3xl">⏳</div>
            <p className="text-[#E2C48A] font-bold text-lg">Verbinde...</p>
          </div>
        </div>
      )}

      {phase === "no-session" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/80 to-[#0A0A0A]/90 z-20 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-[#2D1A0A] to-[#1A0F05] border-2 border-[#C9A86A]/40 rounded-xl p-6 text-[#E2C48A] max-w-md shadow-2xl text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="font-black mb-2 text-lg text-[#C9A86A] uppercase tracking-wider">Nicht verbunden</p>
            <p className="text-sm text-slate-300 mb-5">
              Für {modelName} läuft gerade keine aktive Sitzung. Bitte im Connection Hub verbinden.
            </p>
            <Link
              href="/management/crm-connect"
              className="inline-block px-5 py-3 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-bold rounded-lg text-sm transition shadow-lg hover:shadow-[#C9A86A]/40"
            >
              🔗 Zum Connection Hub
            </Link>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/80 to-[#0A0A0A]/90 z-10 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-[#2D1A0A] to-[#1A0F05] border-2 border-[#C9A86A]/40 rounded-xl p-6 text-[#E2C48A] max-w-md shadow-2xl text-center">
            <p className="font-black mb-3 text-lg text-[#C9A86A] uppercase tracking-wider">⚠️ Verbindungsfehler</p>
            <p className="text-sm text-slate-300 mb-5">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={start}
                className="px-4 py-3 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] hover:to-[#BB8C21] text-black font-bold rounded-lg text-sm transition shadow-lg hover:shadow-[#C9A86A]/40"
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
          {/* Only shown once an actual fan chat is open (detected via
              pollCurrentFan) - showing it whenever the session is merely
              "live" meant it floated over the fan list, a profile page,
              anywhere, with nowhere useful to paste into. Also hidden
              whenever OnlyFans has one of its own modals open (vault
              picker, etc, detected via document.body's "modal-open" class)
              - this overlay has no other way to know OnlyFans opened
              something on top of it, and reported live as visually
              covering the vault picker otherwise. */}
          {currentFan && !modalOpen && (
            // Positioned to match OnlyFans' own message compose box, not
            // centered on the whole 1280x800 frame (left/width calibrated
            // for the 1280x800 frame, center ~67.3%, width ~63%).
            // reserveOverlaySpace (VPS-side) pads the real message list so
            // this never covers actual chat content.
            //
            // "bottom" used to be a flat 14% guess, calibrated only for the
            // compose box's normal (no-attachment) height - confirmed live
            // that attaching a Vault file grows the real compose box taller
            // (price/preview labels + thumbnail row above the text field),
            // which pushes the actual text field down while this fixed
            // overlay stayed put, ending up overlapping the attachment
            // thumbnails. textareaTop (polled from the real page, see
            // pollCurrentFan) is the text field's actual current top in the
            // 800px-tall frame - converting that to a bottom-percentage
            // makes the bar follow the real compose box instead of guessing.
            // Falls back to the old flat 14% if a poll hasn't landed yet.
            <div
              className="absolute z-20 flex flex-col items-center gap-1.5"
              style={{
                left: "67.3%",
                bottom: textareaTop != null ? `${Math.max(0, ((800 - textareaTop) / 800) * 100 + 2)}%` : "14%",
                transform: "translateX(-50%)",
                width: "63%",
              }}
            >
              {emojiPickerOpen && (
                <div className="relative w-full">
                  <EmojiPicker
                    quickEmojis={emojis}
                    onSelect={(emoji) => {
                      handlePasteEmoji(emoji);
                      setEmojiPickerOpen(false);
                    }}
                    onToggleQuick={handleToggleQuickEmoji}
                    onClose={() => setEmojiPickerOpen(false)}
                  />
                </div>
              )}
              <div className="w-full max-h-16 overflow-y-auto scrollbar-hide flex flex-wrap items-center gap-1.5 px-2.5 py-2 rounded-xl bg-black/85 border border-[#C9A86A]/40 backdrop-blur-sm shadow-2xl">
                {emojis.map((emoji, i) => (
                  <button
                    key={i}
                    onClick={() => handlePasteEmoji(emoji)}
                    title="In die Nachricht einfügen"
                    className="text-lg leading-none flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-[#C9A86A]/20 hover:scale-110 transition-all"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={() => setEmojiPickerOpen((v) => !v)}
                  title="Mehr Emojis"
                  className="text-sm flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-dashed border-[#9C7A3D]/60 text-[#C9A86A] bg-white/5 hover:bg-[#C9A86A]/20 transition-all"
                >
                  {emojiPickerOpen ? "▾" : "+"}
                </button>
              </div>
            </div>
          )}

          {pasteStatus === "done" && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 text-[11px] text-emerald-400 bg-black/80 px-3 py-1 rounded-full border border-emerald-500/30">
              ✓ Eingefügt
            </div>
          )}
        </>
      )}
    </div>
  );

  // The Fan CRM panel only makes sense once a specific fan conversation is
  // actually open inside OnlyFans (detected via pollCurrentFan) - showing
  // it against the plain message list or while still connecting would just
  // be an empty, meaningless panel.
  const viewerContent = (
    <div ref={viewerOuterRef} className="relative w-full h-full flex items-stretch justify-start overflow-hidden bg-[#0A0A0A]">
      {videoArea}
      {/* Reserved at the same width whether or not a fan chat is open - a
          bare gray gap next to the video read as broken/accidental; a
          placeholder in the same visual language reads as intentional. */}
      {phase === "live" && (
        <>
          {currentFan ? (
            <FanCrmPanel
              modelId={modelId}
              fanId={currentFan.fanId}
              metadata={currentFan.metadata}
              lastEditedBy={currentFan.lastEditedBy}
              onSaved={pollCurrentFan}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="w-80 flex-shrink-0 h-full bg-[#0A0A0A] flex flex-col">
              <div className="sticky top-0 bg-[#0A0A0A] p-4 border-b border-[#C9A86A]/20">
                <h2 className="text-sm font-black text-[#C9A86A] uppercase tracking-wider">👤 Fan CRM</h2>
                <p className="text-[11px] text-slate-500 mt-1">Öffne einen Fan-Chat in OnlyFans für Fan-Details.</p>
              </div>
              <ModelNotesPanel modelId={modelId} isAdmin={isAdmin} />
            </div>
          )}
        </>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-40 flex items-center justify-center p-4">
        <div className="w-full max-w-[1900px] h-[92vh] rounded-xl overflow-hidden shadow-2xl border-2 border-[#C9A86A]/40 bg-[#050505]">
          {viewerContent}
        </div>
      </div>
    );
  }

  if (isEmbedded) {
    return (
      <div className="w-full h-full bg-[#0A0A0A] overflow-hidden border border-[#C9A86A]/20">
        {viewerContent}
      </div>
    );
  }

  return viewerContent;
}
