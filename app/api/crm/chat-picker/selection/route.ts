import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Reads back whatever text is currently in the caller's chatter slot's
 * chat-list search box - the admin searches + clicks the right contact
 * live in ChatPickerModal, then this captures the exact query string that
 * found it, so /upload-to-vault-fan can reliably re-find the same chat
 * later by typing the same thing.
 * POST /api/crm/chat-picker/selection  Body: { modelId }
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

    const vpsRes = await vpsFetch("/chat-picker-selection", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, modelId }),
    });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const data = await vpsRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[CHAT-PICKER-SELECTION] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
