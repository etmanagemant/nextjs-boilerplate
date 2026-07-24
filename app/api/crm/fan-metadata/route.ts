import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_FIELDS = [
  "real_name",
  "location",
  "age",
  "came_from",
  "preferences",
  "notes",
  "last_subscription_at",
  "last_paid_at",
] as const;

/**
 * Updates Fan CRM panel fields for a (modelId, fanId) pair. Only touches the
 * fields actually passed in body.fields, so the panel can save one field at
 * a time (e.g. just notes, without clobbering preferences someone else just
 * added) rather than requiring a full-object overwrite.
 * POST /api/crm/fan-metadata  Body: { modelId, fanId, fields: {...} }
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelId, fanId, fields } = await req.json();
    if (!modelId || !fanId || !fields || typeof fields !== "object") {
      return NextResponse.json({ error: "Missing modelId, fanId, or fields" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in fields) update[key] = fields[key];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No recognized fields to update" }, { status: 400 });
    }

    // chatter_id is NOT NULL with no default (confirmed directly against
    // the live schema) - leaving it out only ever worked for updating a
    // row that already existed. The very first save for any given fan
    // takes the INSERT path of this upsert instead, which was failing
    // outright with a not-null violation, surfaced to the client as a
    // bare 500. Attributes to whoever is currently saving; harmless to
    // re-set on every update too (last editor, not "original creator").
    const { error } = await supabase.from("crm_fan_metadata").upsert(
      { model_id: modelId, fan_id: fanId, chatter_id: user.id, ...update },
      { onConflict: "model_id,fan_id" }
    );
    if (error) throw error;

    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    console.error("[FAN-METADATA] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to update fan metadata" }, { status: 500 });
  }
}
