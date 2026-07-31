import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-lists - Fan-Listen/Segmente. Optional
 * relatedUserId scopes it to one fan's membership status per list (the
 * real star-dialog behavior, CONFIRMED LIVE 2026-07-31).
 * GET /api/crm/of-inbox/lists?modelId=X&relatedUserId=Y
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
    const relatedUserId = searchParams.get("relatedUserId") || "";
    if (!modelId) return NextResponse.json({ error: "Missing modelId" }, { status: 400 });

    const vpsRes = await vpsFetch(`/of-lists?modelId=${encodeURIComponent(modelId)}${relatedUserId ? `&relatedUserId=${encodeURIComponent(relatedUserId)}` : ""}`);
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-LISTS] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load lists" }, { status: 500 });
  }
}
