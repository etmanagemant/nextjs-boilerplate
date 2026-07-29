import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { createVpsUploadToken } from "@/lib/vpsUploadToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Issues a short-lived, model-scoped upload token so the browser can send
 * files DIRECTLY to the VPS (see /public-upload-to-vault-fan) instead of
 * routing every byte through this app's own serverless function twice -
 * same auth bar as the old proxied upload route (just logged in), since
 * this only ever hands out a token, never touches OnlyFans or a file
 * itself.
 * POST Body: { modelId }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelId } = await req.json();
    if (!modelId || typeof modelId !== "string") {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    }

    const base = process.env.VPS_API_URL;
    if (!base) {
      return NextResponse.json({ error: "VPS_API_URL not configured" }, { status: 500 });
    }

    const token = createVpsUploadToken(modelId);
    return NextResponse.json({ status: "success", token, uploadUrl: `${base}/public-upload-to-vault-fan` });
  } catch (error: any) {
    console.error("[UPLOAD-TOKEN] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to create upload token" }, { status: 500 });
  }
}
