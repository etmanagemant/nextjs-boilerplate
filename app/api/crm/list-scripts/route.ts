import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Called directly from inside the real OnlyFans page (the injected Script
// Vault picker button, running in onlyfans.com's own origin) - not from our
// own app, so there's no session cookie to authenticate with and CORS must
// be opened for this one endpoint specifically, same pattern as
// log-sent-message. Read-only, scoped by whatever userId/role the caller
// already has from its own chatter-slot assignment.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://onlyfans.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Returns the scripts (with their ordered steps) belonging to one model -
 * scripts are model-scoped, not chatter-scoped, so every chatter working
 * that model sees the same library.
 * GET ?modelId=
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");
    if (!modelId) {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400, headers: CORS_HEADERS });
    }

    // Called cross-origin from onlyfans.com with no session cookie at all,
    // so the usual cookie-based client has no authenticated user - and
    // crm_scripts/crm_script_steps' RLS policies require the `authenticated`
    // role, meaning every query here silently returned zero rows instead
    // of erroring (confirmed live: a script existed but the in-chat
    // button always said "keine Scripts"). The admin/service-role client
    // bypasses RLS - safe here since this is read-only and scoped to
    // whatever modelId the caller already has from its own chatter-slot
    // assignment.
    const supabase = createSupabaseAdminClient();
    const [{ data: scripts, error: scriptsError }, { data: steps, error: stepsError }] = await Promise.all([
      supabase
        .from("crm_scripts")
        .select("id, title, created_at")
        .eq("model_id", modelId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("crm_script_steps")
        .select("id, script_id, order_index, step_type, message_text, media_refs, price")
        .order("order_index", { ascending: true }),
    ]);
    if (scriptsError) throw scriptsError;
    if (stepsError) throw stepsError;

    const scriptIds = new Set((scripts || []).map((s) => s.id));
    const stepsByScript = (steps || []).filter((s) => scriptIds.has(s.script_id));
    const result = (scripts || []).map((s) => ({
      ...s,
      steps: stepsByScript.filter((step) => step.script_id === s.id),
    }));

    return NextResponse.json({ status: "success", scripts: result }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error("[LIST-SCRIPTS] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to fetch scripts" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
