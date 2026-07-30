import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function checkAccess() {
  const { user } = await getCurrentUser();
  if (!user) return null;
  const profile = await getCurrentProfile(user.id);
  const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
    user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
    user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
  return isAllowed ? user : null;
}

/**
 * Custom, CRM-only fan nicknames for the OF Inbox (Beta) - purely a local
 * label, never touches OnlyFans itself (see ADD_FAN_NICKNAMES.sql).
 * GET /api/crm/of-inbox/nickname?modelId=X - all nicknames for a model
 */
export async function GET(req: NextRequest) {
  const user = await checkAccess();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const modelId = req.nextUrl.searchParams.get("modelId");
  if (!modelId) return NextResponse.json({ error: "Missing modelId" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_fan_nicknames")
    .select("fan_id, nickname")
    .eq("model_id", modelId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nicknames: Record<string, string> = {};
  (data || []).forEach((r: any) => { nicknames[r.fan_id] = r.nickname; });
  return NextResponse.json({ status: "success", nicknames });
}

/** POST /api/crm/of-inbox/nickname  Body: { modelId, fanId, nickname } */
export async function POST(req: NextRequest) {
  const user = await checkAccess();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { modelId, fanId, nickname } = await req.json();
  if (!modelId || !fanId) return NextResponse.json({ error: "Missing modelId or fanId" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (!nickname || !String(nickname).trim()) {
    const { error } = await supabase.from("crm_fan_nicknames").delete().eq("model_id", modelId).eq("fan_id", String(fanId));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "success" });
  }

  const { error } = await supabase.from("crm_fan_nicknames").upsert(
    { model_id: modelId, fan_id: String(fanId), nickname: String(nickname).trim(), updated_at: new Date().toISOString() },
    { onConflict: "model_id,fan_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "success" });
}
