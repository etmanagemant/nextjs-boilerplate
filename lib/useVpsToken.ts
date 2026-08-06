"use client";

import { useEffect, useRef, useState } from "react";

export type VpsToken = { modelId: string; token: string; base: string } | null;

// Token TTL on the VPS side is 15min (see lib/vpsUploadToken.ts) - refresh
// well before that so a URL built from state is never stale.
const REFRESH_MS = 10 * 60 * 1000;

/**
 * Short-lived, model-scoped token (see /api/crm/media-token) that lets the
 * browser talk to the VPS DIRECTLY, bypassing Next.js's own serverless
 * function - originally built for media (Vercel Fast Origin Transfer),
 * reused here for polling too (Vercel Fluid Active CPU, 2026-08-06):
 * every 15-20s chat-list/notification/message poll used to be a full
 * browser->Vercel->VPS round trip that burned Vercel compute time for
 * work the VPS does anyway. Same trust model as the media use: only ever
 * handed out by our own authenticated+role-checked route to an already
 * logged-in browser, model-scoped and short-lived.
 */
export function useVpsToken(modelId: string): VpsToken {
  const [tok, setTok] = useState<VpsToken>(null);

  useEffect(() => {
    if (!modelId) {
      setTok(null);
      return;
    }
    let cancelled = false;
    const fetchToken = () => {
      fetch("/api/crm/media-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || data.status !== "success") return;
          setTok({ modelId, token: data.token, base: data.base });
        })
        .catch(() => {});
    };
    fetchToken();
    const interval = setInterval(fetchToken, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [modelId]);

  return tok;
}

/**
 * Same token, but as a ref instead of state - for reading the CURRENT
 * token from inside a long-lived setInterval/useCallback closure (chat-
 * list poll, message poll, loadChats/loadMessages themselves) whose own
 * dependency array intentionally does NOT include the token (adding it
 * would give those callbacks a new identity every refresh, and several
 * of them are also used as effect triggers elsewhere - e.g. loadChats
 * changing identity resets the open chat - a token refresh must never
 * cascade into that). A ref sidesteps this entirely: always reads the
 * latest token, no matter how old the closure reading it is.
 */
export function useVpsTokenRef(modelId: string) {
  const tok = useVpsToken(modelId);
  const ref = useRef<VpsToken>(tok);
  useEffect(() => {
    ref.current = tok;
  }, [tok]);
  return ref;
}
