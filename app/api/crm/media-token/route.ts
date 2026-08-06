import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { createVpsUploadToken } from "@/lib/vpsUploadToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Issues a short-lived, model-scoped token so the browser can load
 * OnlyFans media (chat images/videos, Vault thumbnails) DIRECTLY from the
 * VPS instead of routing every byte through this app's own serverless
 * function - same mechanism as /api/crm/upload-token, just for viewing
 * instead of uploading (see /public-media-proxy and
 * /public-vault-thumbnail on the VPS). Streaming every media byte through
 * Vercel twice was eating the app's Fast Origin Transfer quota.
 * POST Body: { modelId }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
    return NextResponse.json({ status: "success", token, base });
  } catch (error: any) {
    console.error("[MEDIA-TOKEN] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to create media token" }, { status: 500 });
  }
}
