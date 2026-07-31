import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-messages - message history for one conversation,
 * read via our own signed request instead of VNC.
 * GET /api/crm/of-inbox/messages?modelId=X&fanId=Y&offset=0
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");
    const fanId = searchParams.get("fanId");
    const offset = searchParams.get("offset") || "";
    const pinned = searchParams.get("pinned") || "";
    if (!modelId || !fanId) {
      return NextResponse.json({ error: "Missing modelId or fanId" }, { status: 400 });
    }

    const vpsRes = await vpsFetch(`/of-messages?modelId=${encodeURIComponent(modelId)}&fanId=${encodeURIComponent(fanId)}${offset ? `&offset=${encodeURIComponent(offset)}` : ""}${pinned ? "&pinned=1" : ""}`);
    const data = await vpsRes.json();
    if (!vpsRes.ok) {
      return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-MESSAGES] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load messages" }, { status: 500 });
  }
}
