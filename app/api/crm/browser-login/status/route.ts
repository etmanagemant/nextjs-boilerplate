import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Poll whether a live session exists / the admin has finished logging in.
 * Used by both the admin-only login flow and the CRM Inbox live view
 * (chatters) - any logged-in CRM user is enough here, the login page
 * itself is separately admin-gated.
 * GET /api/crm/browser-login/status?modelId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 403 });
    }

    const modelId = req.nextUrl.searchParams.get("modelId");
    if (!modelId) {
      return NextResponse.json({ status: "error", error: "Missing modelId" }, { status: 400 });
    }

    const response = await vpsFetch(`/status?modelId=${encodeURIComponent(modelId)}`);
    if (!response.ok) {
      throw new Error(`VPS error ${response.status}`);
    }

    const vpsData = await response.json();
    return NextResponse.json({ status: "success", ...vpsData });
  } catch (error: any) {
    console.error("[BROWSER-LOGIN STATUS] Error:", error.message);
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
