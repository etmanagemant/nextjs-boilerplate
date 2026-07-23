import { NextRequest, NextResponse } from "next/server";
import { getRequestAdmin } from "@/lib/crmAdmin";

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

    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      return NextResponse.json({ status: "error", error: "VPS_API_URL not configured" }, { status: 500 });
    }

    const response = await fetch(`${vpsUrl}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
