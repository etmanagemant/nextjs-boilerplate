import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Same data as /api/crm/list-scripts (crm_scripts + crm_script_steps), but
 * for OF Inbox Beta's own compose bar instead of the VNC-injected button -
 * normal same-origin chatter/admin auth instead of the special CORS-open
 * variant that route needs for being called from onlyfans.com's own origin.
 * GET /api/crm/of-inbox/scripts?modelId=X
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
    if (!modelId) return NextResponse.json({ error: "Missing modelId" }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const [{ data: scripts, error: scriptsError }, { data: steps, error: stepsError }] = await Promise.all([
      supabase.from("crm_scripts").select("id, title, created_at").eq("model_id", modelId).order("created_at", { ascending: false }).limit(100),
      supabase.from("crm_script_steps").select("id, script_id, order_index, step_type, message_text, media_refs, price").order("order_index", { ascending: true }),
    ]);
    if (scriptsError) throw scriptsError;
    if (stepsError) throw stepsError;

    const scriptIds = new Set((scripts || []).map((s) => s.id));
    const stepsByScript = (steps || []).filter((s) => scriptIds.has(s.script_id));
    const result = (scripts || []).map((s) => ({
      ...s,
      steps: stepsByScript.filter((step) => step.script_id === s.id),
    }));

    return NextResponse.json({ status: "success", scripts: result });
  } catch (error: any) {
    console.error("[OF-INBOX-SCRIPTS] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load scripts" }, { status: 500 });
  }
}
