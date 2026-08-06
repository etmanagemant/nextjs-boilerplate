"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TokenState = { modelId: string; token: string; base: string } | null;

// Token TTL on the VPS side is 15min (see lib/vpsUploadToken.ts) - refresh
// well before that so an img/video src built from state is never stale.
const REFRESH_MS = 10 * 60 * 1000;

/**
 * Returns a function that builds a direct-to-VPS media URL (bypassing
 * Next.js's own serverless function) once a token has loaded, falling
 * back to the old Vercel-proxied route until then or if the token fetch
 * failed - the fallback keeps media working, just costs Vercel bandwidth
 * again for that one request. See /api/crm/media-token and
 * /public-media-proxy + /public-vault-thumbnail on the VPS.
 */
export function useMediaProxyUrl(modelId: string) {
  const [tok, setTok] = useState<TokenState>(null);

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

  return useCallback(
    (url: string, kind: "media" | "thumbnail" = "media") => {
      if (tok && tok.modelId === modelId) {
        const path = kind === "thumbnail" ? "public-vault-thumbnail" : "public-media-proxy";
        return `${tok.base}/${path}?modelId=${encodeURIComponent(modelId)}&token=${encodeURIComponent(tok.token)}&url=${encodeURIComponent(url)}`;
      }
      const fallback = kind === "thumbnail" ? "/api/crm/vault-thumbnail" : "/api/crm/of-inbox/media-proxy";
      return `${fallback}?url=${encodeURIComponent(url)}`;
    },
    [tok, modelId]
  );
}
