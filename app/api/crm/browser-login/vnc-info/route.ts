import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";

/**
 * Returns what a CRM user's browser needs to open a real VNC connection to
 * a model's MAIN session on the VPS - the noVNC client asset origin, the
 * WebSocket URL, and the VNC password (auth happens client-side via
 * noVNC's RFB client). Used by the admin-only Connection Hub login flow.
 * Each connected model now has its own dedicated display (see
 * assignModelDisplay on the VPS), so modelId picks the right one - CRM
 * Inbox's live view goes through /api/crm/chatter-slot instead, which
 * already returns its own model-aware wsPath. Any logged-in CRM user is
 * enough here; the login flow's own page is separately admin-gated.
 * GET /api/crm/browser-login/vnc-info?modelId=...
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const modelId = req.nextUrl.searchParams.get("modelId");
    const vpsResponse = await vpsFetch(`/vnc-info${modelId ? `?modelId=${encodeURIComponent(modelId)}` : ""}`);
    if (!vpsResponse.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const { password, wsPath } = await vpsResponse.json();
    if (!password) {
      return NextResponse.json({ error: "VNC not configured on the VPS" }, { status: 500 });
    }

    const vpsOrigin = (process.env.VPS_API_URL || "").replace(/\/$/, "");
    const wsOrigin = vpsOrigin.replace(/^http/, "ws");

    return NextResponse.json({
      assetOrigin: vpsOrigin,
      wsUrl: `${wsOrigin}${wsPath || "/vnc-login/websockify"}`,
      password,
    });
  } catch (err: any) {
    console.error("[VNC-INFO] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to get VNC info" }, { status: 500 });
  }
}
