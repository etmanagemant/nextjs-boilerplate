import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Inserts an emoji directly into the real OnlyFans compose box via the
 * user's own chatter slot - replaces the old clipboard-copy + manual
 * Strg+V flow.
 * POST /api/crm/insert-emoji  Body: { modelId, emoji }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelId, emoji } = await req.json();
    if (!modelId || !emoji) {
      return NextResponse.json({ error: "Missing modelId or emoji" }, { status: 400 });
    }

    const vpsRes = await vpsFetch("/insert-emoji", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, modelId, emoji }),
    });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const data = await vpsRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[INSERT-EMOJI] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to insert emoji" }, { status: 500 });
  }
}
