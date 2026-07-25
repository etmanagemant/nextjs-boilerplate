import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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
 * Returns the scripts a given chatter can see (global + their own +
 * everything for admins), same filtering as ScriptVaultClient/ScriptPicker.
 * GET ?userId=&role=
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const role = searchParams.get("role") || "chatter";
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400, headers: CORS_HEADERS });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("crm_script_library")
      .select("id, title, script_content, category, is_global, assigned_to_user")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const scripts = (data || []).filter(
      (s) => s.is_global || s.assigned_to_user === userId || role === "admin"
    );

    return NextResponse.json({ status: "success", scripts }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error("[LIST-SCRIPTS] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to fetch scripts" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
