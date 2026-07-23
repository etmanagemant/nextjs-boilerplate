/**
 * Shared helper for calling the Puppeteer VPS server. Centralizes the base
 * URL and the shared-secret header so every /api/crm/* route doesn't
 * duplicate it - the VPS has no auth of its own beyond this header.
 */
export async function vpsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = process.env.VPS_API_URL;
  if (!base) {
    throw new Error("VPS_API_URL not configured");
  }

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (process.env.VPS_SHARED_SECRET) {
    headers.set("X-VPS-Secret", process.env.VPS_SHARED_SECRET);
  }

  return fetch(`${base}${path}`, { ...init, headers });
}
