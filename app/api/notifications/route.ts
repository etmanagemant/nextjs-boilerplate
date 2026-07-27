import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { isAdminTierRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Minimal notifications inbox - see CRM_NOTIFICATIONS_SETUP.sql +
 * CRM_NOTIFICATIONS_ADD_RECIPIENT.sql. Two kinds of row:
 *  - recipient_user_id set: personal, visible ONLY to that user (new shift
 *    assigned, own PPV purchased) - any role can have these.
 *  - recipient_user_id null: role-wide broadcast, visible to admin-tier
 *    (admin/content-manager) only - currently just "a model finished a
 *    Vault upload".
 * Read access enforced both here AND via the table's own RLS policy
 * (defense in depth - crm_model_sessions proves this project actually
 * relies on DB-level RLS for anything sensitive, not just an app check).
 * Posting a notification just requires being logged in, since it's only
 * ever triggered by this app's own code after a real event, never directly
 * by user input.
 */
const RETENTION_DAYS = 20;

export async function GET() {
  const { supabase, user } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(user.id);
  const isAdminTier = isAdminTierRole(profile?.role);

  // Opportunistic cleanup instead of a separate cron job - this route is
  // already polled every 60s by anyone with the bell open, which is
  // plenty often enough to keep the table from growing unbounded without
  // needing extra scheduled-job infrastructure for what's a low-volume,
  // low-stakes table.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("crm_notifications").delete().lt("created_at", cutoff);

  let query = supabase
    .from("crm_notifications")
    .select("id, message, model_id, created_at, read_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  // Own personal notifications always visible; the shared broadcast kind
  // (recipient_user_id null) only for admin-tier roles, same restriction
  // as before this got personalized.
  query = isAdminTier
    ? query.or(`recipient_user_id.eq.${user.id},recipient_user_id.is.null`)
    : query.eq("recipient_user_id", user.id);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, modelId, recipientUserId, type } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const { error } = await supabase.from("crm_notifications").insert({
    message,
    model_id: modelId || null,
    recipient_user_id: recipientUserId || null,
    type: type || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "success" });
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("crm_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "success" });
}
