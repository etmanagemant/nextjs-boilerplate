import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function checkAuth() {
  const { user } = await getCurrentUser();
  if (!user) return null;
  const profile = await getCurrentProfile(user.id);
  const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
    user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
    user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
  return isAllowed ? { user, profile } : null;
}

/**
 * Proxies to the VPS's /of-message-like - like/unlike a fan's message
 * (Task #54, only exists on fan-sent messages, not the model's own).
 * POST/DELETE Body: { modelId, fanId, messageId }
 */
export async function POST(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { modelId, fanId, messageId } = await req.json();
  if (!modelId || !fanId || !messageId) return NextResponse.json({ error: "Missing modelId, fanId, or messageId" }, { status: 400 });
  const vpsRes = await vpsFetch("/of-message-like", { method: "POST", body: JSON.stringify({ modelId, fanId, messageId }) });
  const data = await vpsRes.json();
  if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });

  // Explizit gewünscht (2026-08-06): der Chatter, der als Erstes auf einen
  // Tip reagiert - zurückschreibt ODER ihn nur liked - soll den Tip
  // zugeschrieben bekommen. Ein "Like" hatte bisher keine Chatter-
  // Zuordnung irgendwo gespeichert. Wiederverwendet dieselbe Tabelle wie
  // die echten gesendeten Nachrichten (crm_onlyfans_sent_log), media_key
  // als synthetischer Marker statt einer echten Medien-Datei - siehe
  // /api/vps/sync-revenue für die Auswertung.
  try {
    const chatterName = auth.profile?.full_name || auth.user.email || "Chatter";
    const adminSupabase = createSupabaseAdminClient();
    await adminSupabase.from("crm_onlyfans_sent_log").insert({
      model_id: modelId,
      fan_id: String(fanId),
      chatter_name: chatterName,
      media_key: `like:${messageId}`,
    });
  } catch (logError: any) {
    console.error("[MESSAGE-LIKE] Sent-log insert failed:", logError.message);
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await checkAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { modelId, fanId, messageId } = await req.json();
  if (!modelId || !fanId || !messageId) return NextResponse.json({ error: "Missing modelId, fanId, or messageId" }, { status: 400 });
  const vpsRes = await vpsFetch("/of-message-like", { method: "DELETE", body: JSON.stringify({ modelId, fanId, messageId }) });
  const data = await vpsRes.json();
  if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
  return NextResponse.json(data);
}
