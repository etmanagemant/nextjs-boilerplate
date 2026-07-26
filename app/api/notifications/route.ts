import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";

export const dynamic = "force-dynamic";

/**
 * Minimal notifications inbox - see CRM_NOTIFICATIONS_SETUP.sql. Read
 * access is admin/moderator/content-manager-only, enforced both here AND via the table's
 * own RLS policy (defense in depth - crm_model_sessions proves this
 * project actually relies on DB-level RLS for anything sensitive, not
 * just an app-level check). Posting a notification just requires being
 * logged in, since it's only ever triggered by this app's own code after
 * a real event (e.g. a model's confirmed Vault upload), never directly
 * by user input.
 */
const RETENTION_DAYS = 20;

export async function GET() {
  const { supabase, user } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getCurrentProfile(user.id);
  if (profile?.role !== "admin" && profile?.role !== "moderator" && profile?.role !== "content-manager") {
    return NextResponse.json({ notifications: [] });
  }

  // Opportunistic cleanup instead of a separate cron job - this route is
  // already polled every 60s by anyone with the bell open, which is
  // plenty often enough to keep the table from growing unbounded without
  // needing extra scheduled-job infrastructure for what's a low-volume,
  // low-stakes table.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("crm_notifications").delete().lt("created_at", cutoff);

  const { data, error } = await supabase
    .from("crm_notifications")
    .select("id, message, model_id, created_at, read_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data || [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, modelId } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const { error } = await supabase.from("crm_notifications").insert({ message, model_id: modelId || null });
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
