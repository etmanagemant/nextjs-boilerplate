"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface TabModel {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface ModelTabsBarProps {
  models: TabModel[];
  activeModelId: string | null;
  chatterId: string;
}

const POLL_INTERVAL_MS = 25000;
const SEEN_KEY_PREFIX = "crm-inbox-seen:";

/**
 * Persistent top tabs for every connected model - moved out of the
 * sidebar's nested list per the user's ask: a chatter running 2 models in
 * one shift previously had no way to tell if the OTHER (not currently
 * viewed) model got a new message while they're inside the first one's
 * live VNC view. Each tab polls a cheap VPS-side "fingerprint" (top
 * conversation id + last-message preview, see /inbox-fingerprint) and
 * compares it against what was last seen (stored in localStorage, purely
 * client-local - this is a best-effort UI nicety, not an audited record).
 */
export default function ModelTabsBar({ models, activeModelId, chatterId }: ModelTabsBarProps) {
  const [unread, setUnread] = useState<Record<string, boolean>>({});
  const pollingRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ modelId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Click-outside closes the right-click menu, same pattern used elsewhere
  // in this codebase for dismissable popovers.
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  const openInNewTab = (modelId: string) => {
    // /live/<modelId> is a separate, chrome-free route (see app/layout.tsx)
    // showing only the live view + overlay widgets - meant to be dragged
    // onto its own monitor. It targets the SAME underlying VPS slot/VNC
    // session this model already uses elsewhere (assignSlot keys off
    // modelId, and x11vnc runs with -shared) - opening it here never spins
    // up a second slot or browser for the same model.
    window.open(`/live/${modelId}`, "_blank", "noopener,noreferrer");
    setContextMenu(null);
  };

  useEffect(() => {
    if (models.length === 0) return;
    let cancelled = false;

    const checkModel = async (modelId: string) => {
      try {
        const res = await fetch(`/api/crm/inbox-fingerprint?modelId=${encodeURIComponent(modelId)}`);
        const data = await res.json();
        if (data.status !== "success" || !data.fingerprint) return;

        // Keyed by chatter AND model - NOT just model. Two chatters sharing
        // one physical browser (e.g. training a new hire on the same
        // machine) must never clear each other's unread dot just because
        // one of them looked at a model the other hasn't yet. Separate
        // computers were already fine either way (localStorage never
        // crossed devices), this only matters for the shared-machine case.
        const seenKey = `${SEEN_KEY_PREFIX}${chatterId}:${modelId}`;
        const lastSeen = localStorage.getItem(seenKey);

        if (modelId === activeModelId) {
          // Currently viewing this model - whatever's on top right now
          // counts as seen, so it never shows unread right after switching
          // away from it.
          localStorage.setItem(seenKey, data.fingerprint);
          setUnread((u) => (u[modelId] ? { ...u, [modelId]: false } : u));
        } else if (!lastSeen) {
          // First time ever checking this model on this browser - nothing
          // to compare against yet, store it as the baseline instead of
          // flagging a false unread.
          localStorage.setItem(seenKey, data.fingerprint);
        } else if (lastSeen !== data.fingerprint) {
          setUnread((u) => (u[modelId] ? u : { ...u, [modelId]: true }));
        }
      } catch {
        // best-effort - a failed check just skips this round
      }
    };

    const runCheck = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      for (const m of models) {
        if (cancelled) break;
        await checkModel(m.id);
      }
      pollingRef.current = false;
    };

    runCheck();
    const interval = setInterval(runCheck, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, activeModelId, chatterId]);

  if (models.length === 0) return null;

  return (
    <div className="flex items-end gap-1 overflow-x-auto scrollbar-hide">
      {models.map((m) => {
        const isActive = m.id === activeModelId;
        return (
          <Link
            key={m.id}
            href={`/crm-inbox?model=${m.id}`}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ modelId: m.id, x: e.clientX, y: e.clientY });
            }}
            // Real tab shape: rounded top corners only, no bottom border -
            // the active tab's background matches the content area right
            // below it (bg-black) and dips 1px past the header's own
            // bottom border to visually paint over it, so it reads as
            // "attached to" the content it controls, exactly like a
            // browser tab. Inactive tabs sit a touch shorter/recessed
            // (mt-1.5) and stay transparent until hovered.
            className={`relative flex items-center gap-2 pl-1.5 pr-3 pt-1.5 rounded-t-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition flex-shrink-0 border border-b-0 ${
              isActive
                ? "bg-black border-[#C9A86A]/50 text-[#C9A86A] pb-[7px] -mb-px z-10"
                : "bg-transparent border-transparent text-slate-400 hover:text-[#E2C48A] hover:bg-black/40 pb-1.5 mt-1.5"
            }`}
          >
            {m.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.avatar_url}
                alt={m.name}
                className="w-9 h-9 rounded-full object-cover border-2 border-[#C9A86A]/40 flex-shrink-0"
              />
            ) : (
              <span className="w-9 h-9 flex items-center justify-center text-lg flex-shrink-0">👤</span>
            )}
            <span className="truncate max-w-[110px]">{m.name}</span>
            {unread[m.id] && !isActive && (
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" aria-label="Neue Nachricht" />
            )}
          </Link>
        );
      })}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-[#1A1A1A] border border-[#C9A86A]/30 rounded-lg shadow-2xl z-50 py-1"
          style={{ left: `${Math.max(8, contextMenu.x - 140)}px`, top: `${contextMenu.y}px`, minWidth: "220px" }}
        >
          <button
            onClick={() => openInNewTab(contextMenu.modelId)}
            className="w-full text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 hover:bg-[#C9A86A]/20 hover:text-[#E2C48A] transition"
          >
            ↗ In neuem Tab öffnen
          </button>
        </div>
      )}
    </div>
  );
}
