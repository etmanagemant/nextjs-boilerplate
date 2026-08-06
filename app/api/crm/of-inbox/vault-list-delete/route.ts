import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-vault-list-delete - loescht einen Tresor-Ordner
 * (die Medien selbst bleiben im Tresor). CONFIRMED LIVE 2026-08-06 via
 * real network capture.
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

    const vpsRes = await vpsFetch("/of-vault-list-delete", { method: "DELETE", body: JSON.stringify({ modelId, listId }) });
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-VAULT-LIST-DELETE] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to delete vault list" }, { status: 500 });
  }
}
