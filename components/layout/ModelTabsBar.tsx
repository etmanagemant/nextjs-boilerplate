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
export default function ModelTabsBar({ models, activeModelId }: ModelTabsBarProps) {
  const [unread, setUnread] = useState<Record<string, boolean>>({});
  const pollingRef = useRef(false);

  useEffect(() => {
    if (models.length === 0) return;
    let cancelled = false;

    const checkModel = async (modelId: string) => {
      try {
        const res = await fetch(`/api/crm/inbox-fingerprint?modelId=${encodeURIComponent(modelId)}`);
        const data = await res.json();
        if (data.status !== "success" || !data.fingerprint) return;

        const seenKey = `${SEEN_KEY_PREFIX}${modelId}`;
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
  }, [models, activeModelId]);

  if (models.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2 bg-[#0A0A0A] border-b border-[#9C7A3D]/20 flex-shrink-0 scrollbar-hide">
      {models.map((m) => {
        const isActive = m.id === activeModelId;
        return (
          <Link
            key={m.id}
            href={`/crm-inbox?model=${m.id}`}
            className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition flex-shrink-0 border ${
              isActive
                ? "bg-[#C9A86A]/20 text-[#C9A86A] border-[#C9A86A]/50"
                : "text-slate-400 hover:text-[#E2C48A] hover:bg-[#C9A86A]/10 border-transparent"
            }`}
          >
            {m.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.avatar_url}
                alt={m.name}
                className="w-5 h-5 rounded-full object-cover border border-[#C9A86A]/40 flex-shrink-0"
              />
            ) : (
              <span className="flex-shrink-0">👤</span>
            )}
            <span className="truncate max-w-[100px]">{m.name}</span>
            {unread[m.id] && !isActive && (
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" aria-label="Neue Nachricht" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
