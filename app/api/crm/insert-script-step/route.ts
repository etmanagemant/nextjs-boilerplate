import { NextRequest, NextResponse } from "next/server";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Called directly from inside the real OnlyFans page (the injected Script
// Vault picker button, running in onlyfans.com's own origin) - same CORS
// pattern as list-scripts/log-sent-message, since there's no session
// cookie available cross-origin. Proxies to the VPS, which holds the
// shared secret that never gets exposed to the browser.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://onlyfans.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST Body: { userId, modelId, messageText, stepType, vaultSearchTerm, price }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, modelId, messageText } = body;
    if (!userId || !modelId || !messageText) {
      return NextResponse.json({ error: "Missing userId, modelId, or messageText" }, { status: 400, headers: CORS_HEADERS });
    }

    const vpsRes = await vpsFetch("/insert-script-step", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502, headers: CORS_HEADERS });
    }
    const data = await vpsRes.json();
    return NextResponse.json(data, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error("[INSERT-SCRIPT-STEP] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to insert script step" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
