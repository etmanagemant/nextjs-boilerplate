import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Navigates the user's own chatter slot to OnlyFans' real post-composer -
 * the native "New Post" button is hidden in the compact CRM view, this is
 * its replacement entry point.
 * POST /api/crm/open-new-post  Body: { modelId }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelId } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    }

    const vpsRes = await vpsFetch("/open-new-post", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, modelId }),
    });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const data = await vpsRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OPEN-NEW-POST] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to open new post" }, { status: 500 });
  }
}
