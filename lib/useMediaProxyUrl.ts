"use client";

import { useCallback } from "react";
import { useVpsToken } from "./useVpsToken";

/**
 * Returns a function that builds a direct-to-VPS media URL (bypassing
 * Next.js's own serverless function) once a token has loaded, falling
 * back to the old Vercel-proxied route until then or if the token fetch
 * failed - the fallback keeps media working, just costs Vercel bandwidth
 * again for that one request. See useVpsToken, and /public-media-proxy +
 * /public-vault-thumbnail on the VPS.
 */
export function useMediaProxyUrl(modelId: string) {
  const tok = useVpsToken(modelId);

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
