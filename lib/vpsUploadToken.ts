import crypto from "crypto";

// Matches verifyUploadToken in app/vps-server.js exactly - HMAC-SHA256 over
// a base64url {modelId, exp} payload, keyed by VPS_SHARED_SECRET (already
// shared between this app and the VPS, no new secret to manage). Lets the
// browser upload files DIRECTLY to the VPS instead of routing every byte
// through a Vercel serverless function twice - the shared secret itself
// must never reach the browser (it controls every connected model's live
// session), so this short-lived, model-scoped token stands in for it.
// Generous on purpose - a large video on a slow mobile upload can take a
// while, and a fresh token is minted per FILE (not shared across a whole
// batch), so this only needs to outlast one file's own upload time.
const TOKEN_TTL_MS = 15 * 60 * 1000;

export function createVpsUploadToken(modelId: string): string {
  const secret = process.env.VPS_SHARED_SECRET;
  if (!secret) throw new Error("VPS_SHARED_SECRET not configured");

  const payload = { modelId, exp: Date.now() + TOKEN_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
  return `${payloadB64}.${signature}`;
}
