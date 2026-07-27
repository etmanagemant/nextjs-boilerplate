import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Called directly from inside the real OnlyFans page (the injected PPV-
// purchase-detector script, running in onlyfans.com's own origin) - same
// CORS setup as log-sent-message, no session cookie available there.
//
// UNVERIFIED DETECTION WARNING: the VPS-side script that calls this route
// guesses at OnlyFans' "this PPV is now unlocked" DOM signal (no confirmed
// account with a real purchase to check against yet, per the user's
// explicit go-ahead to ship a best-effort guess now rather than wait). If
// this route never gets called after a real purchase, the guessed
// selector in vps-server.js's PPV_PURCHASE_DETECTOR_SCRIPT_TEMPLATE is
// wrong and needs live re-checking - this endpoint itself is not the
// suspect in that case.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://onlyfans.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * A previously-locked PPV bubble this model's account sent just became
 * unlocked - resolve which chatter actually sent it (via the same sent-log
 * used for the "gesendet von" overlay) and give THAT chatter a personal
 * bell notification, not a broadcast everyone sees. Also feeds the Fan-CRM
 * panel's "Gesamtausgaben"/"Zuletzt bezahlt" fields going forward - not a
 * historical backfill (no confirmed live source for a fan's full OnlyFans
 * spend history, see #81), but every purchase detected from here on adds
 * up in crm_fan_metadata instead of staying manual-only.
 * POST Body: { modelId, fanId, mediaKey?, messageText?, price? }
 */
export async function POST(req: NextRequest) {
  try {
    const { modelId, fanId, mediaKey, messageText, price } = await req.json();
    if (!modelId || !fanId || (!mediaKey && !messageText)) {
      return NextResponse.json(
        { error: "Missing modelId, fanId, or mediaKey/messageText" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createSupabaseAdminClient();

    const priceNum = Number(price);
    if (priceNum > 0) {
      const { data: existingMeta } = await supabase
        .from("crm_fan_metadata")
        .select("lifetime_value")
        .eq("model_id", modelId)
        .eq("fan_id", String(fanId))
        .maybeSingle();
      await supabase.from("crm_fan_metadata").upsert(
        {
          model_id: modelId,
          fan_id: String(fanId),
          lifetime_value: Number(existingMeta?.lifetime_value || 0) + priceNum,
          last_paid_at: new Date().toISOString(),
        },
        { onConflict: "model_id,fan_id" }
      );
    }

    let sentLogQuery = supabase
      .from("crm_onlyfans_sent_log")
      .select("chatter_name")
      .eq("model_id", modelId)
      .eq("fan_id", String(fanId));
    sentLogQuery = mediaKey ? sentLogQuery.eq("media_key", mediaKey) : sentLogQuery.eq("message_text", messageText);

    const { data: sentLogEntry } = await sentLogQuery.order("sent_at", { ascending: false }).limit(1).maybeSingle();
    if (!sentLogEntry?.chatter_name) {
      // No attribution on file (sent before this logging existed, or by a
      // fan/system action, not a chatter) - nothing to notify.
      return NextResponse.json({ status: "no_attribution" }, { headers: CORS_HEADERS });
    }

    // Same resolution direction as /api/crm/current-fan's lastEditedBy,
    // just reversed (name -> user_id instead of user_id -> name).
    const { data: chatterProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .or(`full_name.eq.${sentLogEntry.chatter_name},email.eq.${sentLogEntry.chatter_name}`)
      .limit(1)
      .maybeSingle();
    if (!chatterProfile?.user_id) {
      return NextResponse.json({ status: "chatter_not_found" }, { headers: CORS_HEADERS });
    }

    const { data: modelRow } = await supabase.from("models").select("name").eq("id", modelId).maybeSingle();
    const modelName = modelRow?.name || "ein Model";

    await supabase.from("crm_notifications").insert({
      message: `💰 Dein PPV bei ${modelName} wurde gekauft!`,
      model_id: modelId,
      recipient_user_id: chatterProfile.user_id,
      type: "ppv_purchased",
    });

    return NextResponse.json({ status: "success" }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error("[PPV-PURCHASED] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to record PPV purchase" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
