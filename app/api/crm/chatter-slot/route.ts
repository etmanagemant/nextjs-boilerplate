import { NextRequest, NextResponse } from "next/server";
import { getRequestAdmin } from "@/lib/crmAdmin";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Assigns (or reuses) an independent chatter slot for the current user +
 * model: its own Chrome window on its own virtual display, so multiple
 * chatters can work different fan conversations on the same or different
 * models at the same time, instead of sharing one VNC feed and fighting
 * over the same scroll position/cursor. Any logged-in CRM user is enough
 * here (chatters, not just admins) - the VPS pool itself is a small, bounded
 * number of slots, not one per user. Passes along whether this user is an
 * admin so the VPS only injects the chatter-only nav restrictions (hiding
 * Home/Queue/Statements/My profile/More/Statistics) for actual chatters -
 * admins get the real, unrestricted OnlyFans page.
 * POST /api/crm/chatter-slot  Body: { modelId }
 */
export async function POST(req: NextRequest) {
  try {
    const { user, isAdmin, supabase } = await getRequestAdmin();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelId } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    }

    // Baked into the live OnlyFans page as a "gesendet von X" label under
    // this chatter's own outgoing messages - needs a human-readable name,
    // not just the user id.
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const chatterName = profile?.full_name || user.email || "Chatter";

    const slotResponse = await vpsFetch("/chatter-slot", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, modelId, role: isAdmin ? "admin" : "chatter", chatterName }),
    });
    if (!slotResponse.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const slotData = await slotResponse.json();

    if (slotData.status === "no_session") {
      return NextResponse.json({ status: "no_session", modelId });
    }
    if (slotData.status !== "success") {
      return NextResponse.json({ error: slotData.error || "Slot assignment failed" }, { status: 502 });
    }

    // Every slot shares the same VNC password as the login display (see
    // /vnc-info) - what actually routes a client to the right, independent
    // window is the per-slot path, not a distinct password.
    const vncInfoResponse = await vpsFetch("/vnc-info");
    if (!vncInfoResponse.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const { password } = await vncInfoResponse.json();
    if (!password) {
      return NextResponse.json({ error: "VNC not configured on the VPS" }, { status: 500 });
    }

    const vpsOrigin = (process.env.VPS_API_URL || "").replace(/\/$/, "");
    const wsOrigin = vpsOrigin.replace(/^http/, "ws");

    return NextResponse.json({
      status: "success",
      wsUrl: `${wsOrigin}${slotData.wsPath}`,
      password,
    });
  } catch (error: any) {
    console.error("[CHATTER-SLOT] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to get chatter slot" }, { status: 500 });
  }
}
