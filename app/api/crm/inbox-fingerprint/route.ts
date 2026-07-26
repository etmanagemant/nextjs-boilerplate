import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cheap "did the top of this model's inbox change" signal, used by the
 * model-tab unread badges - any logged-in CRM user is enough here, same as
 * /api/crm/browser-login/status. See vps-server.js's /inbox-fingerprint
 * comment for why this is safe to poll (reads already-rendered DOM, never
 * triggers a real OnlyFans fetch).
 * GET /api/crm/inbox-fingerprint?modelId=xxx
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

    const response = await vpsFetch(`/inbox-fingerprint?modelId=${encodeURIComponent(modelId)}`);
    if (!response.ok) {
      throw new Error(`VPS error ${response.status}`);
    }

    const vpsData = await response.json();
    return NextResponse.json(vpsData);
  } catch (error: any) {
    console.error("[INBOX-FINGERPRINT] Error:", error.message);
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
