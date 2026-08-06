import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bulk variant of /api/crm/of-inbox/fan-metadata - one row per requested
 * fanId instead of a single fan, so the whole Fan-CRM panel (Gesamt-
 * ausgaben, Fan seit, Notizen, ...) can be preloaded for every fan
 * already known to the client (the currently loaded chat-list page(s))
 * instead of only fetched once a chatter clicks into that one
 * conversation (gemeldetes "Trägheits"-Problem, 2026-08-06 - opening an
 * already-loaded fan's chat should be instant, not a fresh network wait).
 * POST Body: { modelId, fanIds: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { modelId, fanIds } = await req.json();
    if (!modelId || !Array.isArray(fanIds) || fanIds.length === 0) {
      return NextResponse.json({ error: "Missing modelId or fanIds" }, { status: 400 });
    }

    const { data: rows, error } = await supabase
      .from("crm_fan_metadata")
      .select("*")
      .eq("model_id", modelId)
      .in("fan_id", fanIds.map(String));
    if (error) throw error;

    // Same "who last edited this" resolution as the single-fan route,
    // just batched: one profiles query for every distinct chatter_id
    // across the whole page instead of N.
    const chatterIds = Array.from(new Set((rows || []).map((r: any) => r.chatter_id).filter(Boolean)));
    let editorNameById = new Map<string, string>();
    if (chatterIds.length > 0) {
      const { data: editors } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", chatterIds);
      editorNameById = new Map((editors || []).map((e: any) => [e.user_id, e.full_name || e.email || ""]));
    }

    const metadataByFan: Record<string, any> = {};
    const lastEditedByFan: Record<string, string | null> = {};
    (rows || []).forEach((r: any) => {
      metadataByFan[r.fan_id] = r;
      lastEditedByFan[r.fan_id] = r.chatter_id ? editorNameById.get(r.chatter_id) || null : null;
    });

    return NextResponse.json({ status: "success", metadataByFan, lastEditedByFan });
  } catch (error: any) {
    console.error("[OF-INBOX-FAN-METADATA-BULK] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load fan metadata" }, { status: 500 });
  }
}
