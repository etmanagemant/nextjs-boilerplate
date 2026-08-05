import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-massmessage-recipient-count - live recipient
 * count as list segments get checked/unchecked in the compose UI.
 * CONFIRMED LIVE 2026-08-05.
 * GET ?modelId=X&listId=fans&excludedLists=following,muted
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");
    const listId = searchParams.get("listId");
    const excludedLists = searchParams.get("excludedLists");
    if (!modelId || !listId) return NextResponse.json({ error: "Missing modelId or listId" }, { status: 400 });

    const qs = new URLSearchParams({ modelId, listId });
    if (excludedLists) qs.set("excludedLists", excludedLists);
    const vpsRes = await vpsFetch(`/of-massmessage-recipient-count?${qs.toString()}`);
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-MASSMESSAGE-RECIPIENT-COUNT] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load recipient count" }, { status: 500 });
  }
}
