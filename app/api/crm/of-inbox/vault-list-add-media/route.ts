import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-vault-list-add-media - fuegt Tresor-Medien
 * einem Ordner hinzu (OnlyFans' Ordner sind nicht-exklusive Tags, ein
 * Medium kann in mehreren Ordnern sein - kein echtes "Verschieben").
 * CONFIRMED LIVE 2026-08-06 via real network capture.
 * POST Body: { modelId, listId, mediaIds }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { modelId, listId, mediaIds } = await req.json();
    if (!modelId || !listId || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: "Missing modelId, listId, or mediaIds" }, { status: 400 });
    }

    const vpsRes = await vpsFetch("/of-vault-list-add-media", { method: "POST", body: JSON.stringify({ modelId, listId, mediaIds }) });
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-VAULT-LIST-ADD-MEDIA] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to add media to vault list" }, { status: 500 });
  }
}
