import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";

/**
 * Returns what a CRM user's browser needs to open a real VNC connection to
 * a model's live browser on the VPS - the noVNC client asset origin, the
 * WebSocket URL, and the VNC password (auth happens client-side via
 * noVNC's RFB client). Used by both the admin-only login flow (a fresh
 * browser on the dedicated login display) and the CRM Inbox live view
 * (chatters, viewing whatever the persistent session currently shows) -
 * both connect to the same VNC-served display, since after a successful
 * login the very same browser keeps running and serves both. Any
 * logged-in CRM user is enough here; the login flow's own page is
 * separately admin-gated.
 * GET /api/crm/browser-login/vnc-info
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
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
