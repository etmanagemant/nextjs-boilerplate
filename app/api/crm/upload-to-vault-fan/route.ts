import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Forwards one local file straight through to the VPS as a raw binary
 * body - not JSON like every other /api/crm/* route, since vpsFetch's
 * Content-Type assumption doesn't fit a file upload. The VPS writes it to
 * a temp path and drives the actual "send as a priced message to the
 * Vault-Fan" automation (see /upload-to-vault-fan on the VPS).
 * POST multipart/form-data: file, modelId, vaultFanId (preferred) or
 * vaultFanLabel (fallback), price
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const base = process.env.VPS_API_URL;
    if (!base) {
      return NextResponse.json({ error: "VPS_API_URL not configured" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const modelId = formData.get("modelId") as string | null;
    const vaultFanLabel = (formData.get("vaultFanLabel") as string | null) || "";
    const vaultFanId = (formData.get("vaultFanId") as string | null) || "";
    const price = formData.get("price") as string | null;
    // Batching (multiple files sent as one OnlyFans message instead of one
    // message per file): every file in a batch shares the same batchId,
    // the client marks only the last one isLastInBatch=true - see the VPS
    // route's own comment for the two-phase stage/commit protocol this
    // drives.
    const batchId = (formData.get("batchId") as string | null) || "";
    const isLastInBatch = (formData.get("isLastInBatch") as string | null) || "";

    if (!file || !modelId || (!vaultFanLabel && !vaultFanId)) {
      return NextResponse.json({ error: "Missing file, modelId, or vaultFanLabel/vaultFanId" }, { status: 400 });
    }

    const params = new URLSearchParams({
      modelId,
      fileName: file.name,
      ...(vaultFanId ? { vaultFanId } : {}),
      ...(vaultFanLabel ? { vaultFanLabel } : {}),
      ...(price ? { price } : {}),
      ...(batchId ? { batchId, isLastInBatch } : {}),
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const headers: Record<string, string> = { "Content-Type": "application/octet-stream" };
    if (process.env.VPS_SHARED_SECRET) {
      headers["X-VPS-Secret"] = process.env.VPS_SHARED_SECRET;
    }

    const vpsRes = await fetch(`${base}/upload-to-vault-fan?${params.toString()}`, {
      method: "POST",
      headers,
      body: buffer,
    });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const data = await vpsRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[UPLOAD-TO-VAULT-FAN] Error:", error.message);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}
