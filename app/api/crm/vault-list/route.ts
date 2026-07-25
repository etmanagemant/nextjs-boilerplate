import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Scrapes the model's real OnlyFans Vault for visible media (optionally
 * filtered by the vault's own search box) and returns thumbnails/labels -
 * drives the actual Vault search server-side so the admin gets a plain,
 * clickable grid in our own UI instead of a separate embedded live
 * OnlyFans view.
 * POST /api/crm/vault-list  Body: { modelId, query }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { modelId, query } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    }

    const vpsRes = await vpsFetch("/vault-list", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, modelId, query: query || "" }),
    });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const data = await vpsRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[VAULT-LIST] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
