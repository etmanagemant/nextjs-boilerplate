import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Navigates the caller's own chatter slot to the real OnlyFans chat list,
 * so ChatPickerModal's VNC feed opens directly on it instead of wherever
 * the slot happened to be last.
 * POST /api/crm/chat-picker/goto  Body: { modelId }
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

    const vpsRes = await vpsFetch("/chat-picker-goto", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, modelId }),
    });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const data = await vpsRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[CHAT-PICKER-GOTO] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
