import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-list-delete - deletes a whole custom list
 * (Task #69). CONFIRMED LIVE 2026-07-31 against a disposable test list.
 * DELETE Body: { modelId, listId }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { modelId, listId } = await req.json();
    if (!modelId || !listId) return NextResponse.json({ error: "Missing modelId or listId" }, { status: 400 });

    const vpsRes = await vpsFetch("/of-list-delete", { method: "DELETE", body: JSON.stringify({ modelId, listId }) });
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-LIST-DELETE] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to delete list" }, { status: 500 });
  }
}
