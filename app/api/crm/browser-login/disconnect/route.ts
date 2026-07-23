import { NextRequest, NextResponse } from "next/server";
import { getRequestAdmin } from "@/lib/crmAdmin";

export const dynamic = "force-dynamic";

/**
 * Disconnect a model: mark the session inactive in Supabase AND close the
 * live browser on the VPS so it stops eating RAM.
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

    const { error: updateError } = await supabase
      .from("crm_model_sessions")
      .update({
        is_active: false,
        last_verified_at: new Date().toISOString(),
      })
      .eq("model_id", modelId);

    if (updateError) {
      console.error("[DISCONNECT] Update failed:", updateError.message);
      return NextResponse.json({ status: "error", error: "Failed to disconnect session" }, { status: 500 });
    }

    const vpsUrl = process.env.VPS_API_URL;
    if (vpsUrl) {
      try {
        await fetch(`${vpsUrl}/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId }),
        });
      } catch (vpsErr: any) {
        // Not fatal - DB state already reflects "disconnected"
        console.warn("[DISCONNECT] VPS cleanup failed:", vpsErr.message);
      }
    }

    return NextResponse.json({ status: "success", disconnected: true, modelId });
  } catch (err: any) {
    console.error("[DISCONNECT] Error:", err?.message);
    return NextResponse.json({ status: "error", error: err?.message }, { status: 500 });
  }
}
