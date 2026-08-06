import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-vault-media-hide - das ist, was der Tresor's
 * eigener "loeschen"-Button wirklich aufruft (Soft-Hide, kein Hard-
 * Delete - OnlyFans behaelt einen Papierkorb). CONFIRMED LIVE 2026-08-06
 * via real network capture.
 * PUT Body: { modelId, mediaIds }
 */
export async function PUT(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { modelId, mediaIds } = await req.json();
    if (!modelId || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: "Missing modelId or mediaIds" }, { status: 400 });
    }

    const vpsRes = await vpsFetch("/of-vault-media-hide", { method: "PUT", body: JSON.stringify({ modelId, mediaIds }) });
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-VAULT-MEDIA-HIDE] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to hide vault media" }, { status: 500 });
  }
}
