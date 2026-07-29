import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { createVpsUploadToken } from "@/lib/vpsUploadToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Issues a short-lived, model-scoped token so a plain <audio src> tag can
 * load /audio-stream directly from the VPS - same signed-token mechanism
 * as /api/crm/upload-token (an <audio> tag can't attach a custom auth
 * header, same reason that route exists for direct browser uploads).
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
    const audioUrl = `${base}/audio-stream?modelId=${encodeURIComponent(modelId)}&token=${encodeURIComponent(token)}`;
    return NextResponse.json({ status: "success", audioUrl });
  } catch (error: any) {
    console.error("[AUDIO-TOKEN] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to create audio token" }, { status: 500 });
  }
}
