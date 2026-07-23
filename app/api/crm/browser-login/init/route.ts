import { NextRequest, NextResponse } from "next/server";
import { getRequestAdmin } from "@/lib/crmAdmin";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * Open (or reuse) a live browser on the VPS for a model and navigate to the
 * OnlyFans login page. Admin then logs in through the live view.
 * POST /api/crm/browser-login/init  Body: { modelId }
 */
export async function POST(req: NextRequest) {
  try {
    const { isAdmin } = await getRequestAdmin();
    if (!isAdmin) {
      return NextResponse.json({ status: "error", error: "Unauthorized - Admin access required" }, { status: 403 });
    }

    const { modelId } = await req.json();
    if (!modelId) {
      return NextResponse.json({ status: "error", error: "Missing modelId" }, { status: 400 });
    }

    const response = await vpsFetch("/connect", {
      method: "POST",
      body: JSON.stringify({ modelId }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`VPS error ${response.status}: ${text}`);
    }

    const vpsData = await response.json();
    return NextResponse.json({ status: "success", modelId, ...vpsData });
  } catch (error: any) {
    console.error("[BROWSER-LOGIN INIT] Error:", error.message);
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
