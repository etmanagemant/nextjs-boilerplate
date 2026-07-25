import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Real Vault contents (thumbnails + folder list) for the model, sniffed
 * server-side from OnlyFans' own SPA requests rather than re-requesting
 * its API directly (a bare fetch to OnlyFans' /api2/ endpoints gets
 * rejected - they're signed by its own front-end JS). See /vault-media
 * on the VPS.
 * POST /api/crm/vault-media  Body: { modelId, listId? }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { modelId, listId } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    }

    const vpsRes = await vpsFetch("/vault-media", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, modelId, listId: listId || undefined }),
    });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const data = await vpsRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[VAULT-MEDIA] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
