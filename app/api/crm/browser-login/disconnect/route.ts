import { NextRequest, NextResponse } from "next/server";
import { getRequestAdmin } from "@/lib/crmAdmin";
import { disconnectModelSession } from "@/lib/crmSession";

export const dynamic = "force-dynamic";

/**
 * Disconnect a model: clears the stored cookies in Supabase and closes the
 * live browser on the VPS (which also wipes its on-disk Chrome profile), so
 * reconnecting never inherits the previous login's data.
 * POST /api/crm/browser-login/disconnect  Body: { modelId }
 */
export async function POST(req: NextRequest) {
  try {
    const { isAdmin, supabase } = await getRequestAdmin();
    if (!isAdmin) {
      return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 403 });
    }

    const { modelId } = await req.json();
    if (!modelId) {
      return NextResponse.json({ status: "error", error: "Missing modelId" }, { status: 400 });
    }

    const { error } = await disconnectModelSession(supabase, modelId);
    if (error) {
      console.error("[DISCONNECT] Update failed:", error.message);
      return NextResponse.json({ status: "error", error: "Failed to disconnect session" }, { status: 500 });
    }

    return NextResponse.json({ status: "success", disconnected: true, modelId });
  } catch (err: any) {
    console.error("[DISCONNECT] Error:", err?.message);
    return NextResponse.json({ status: "error", error: err?.message }, { status: 500 });
  }
}
