import { NextResponse } from "next/server";
import { getRequestAdmin } from "@/lib/crmAdmin";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";

/**
 * Returns what the admin's browser needs to open a real VNC connection to
 * the dedicated login display on the VPS - the noVNC client asset origin,
 * the WebSocket URL, and the VNC password (auth happens client-side in the
 * browser via noVNC's RFB client). Admin-only, same gate as every other
 * browser-login route.
 * GET /api/crm/browser-login/vnc-info
 */
export async function GET() {
  try {
    const { isAdmin, user } = await getRequestAdmin();
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const vpsResponse = await vpsFetch("/vnc-info");
    if (!vpsResponse.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const { password } = await vpsResponse.json();
    if (!password) {
      return NextResponse.json({ error: "VNC not configured on the VPS" }, { status: 500 });
    }

    const vpsOrigin = (process.env.VPS_API_URL || "").replace(/\/$/, "");
    const wsOrigin = vpsOrigin.replace(/^http/, "ws");

    return NextResponse.json({
      assetOrigin: vpsOrigin,
      wsUrl: `${wsOrigin}/vnc-login/websockify`,
      password,
    });
  } catch (err: any) {
    console.error("[VNC-INFO] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to get VNC info" }, { status: 500 });
  }
}
