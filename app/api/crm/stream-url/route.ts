import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";

/**
 * Mints a one-shot streaming URL for a model's live session.
 * GET /api/crm/stream-url?modelId=xxx
 *
 * The browser connects to the returned URL directly on the VPS (not
 * through this app) so the connection can stay open indefinitely - Vercel's
 * serverless functions would kill a proxied connection that long-lived
 * after a few seconds. The permanent VPS shared secret never reaches the
 * client; instead this mints a random, single-use, 60-second-lived token
 * via the VPS's shared-secret-protected /stream-token route.
 */
export async function GET(request: NextRequest) {
  const { user } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const modelId = request.nextUrl.searchParams.get("modelId");
  if (!modelId) {
    return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
  }

  try {
    const vpsResponse = await vpsFetch("/stream-token", {
      method: "POST",
      body: JSON.stringify({ modelId }),
    });
    if (!vpsResponse.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const { token } = await vpsResponse.json();

    const vpsOrigin = (process.env.VPS_API_URL || "").replace(/\/$/, "");
    return NextResponse.json({
      streamUrl: `${vpsOrigin}/stream?modelId=${encodeURIComponent(modelId)}&token=${encodeURIComponent(token)}`,
    });
  } catch (err: any) {
    console.error("[STREAM-URL] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to mint stream token" }, { status: 500 });
  }
}
