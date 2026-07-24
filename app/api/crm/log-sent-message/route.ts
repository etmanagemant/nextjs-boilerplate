import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Called directly from inside the real OnlyFans page (the injected sent-by
// script, running in onlyfans.com's own origin) - not from our own app, so
// there's no session cookie to authenticate with and CORS must be opened
// for this one endpoint specifically. Only ever writes/reads non-sensitive
// attribution metadata (who sent which exact message text, when), scoped
// to a real model_id the caller would already have to know.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://onlyfans.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Persists "this chatter sent this exact message text" so the sent-by
 * overlay is authoritative and visible to every viewer (any chatter/admin,
 * any time) rather than only whoever happened to be looking when it was
 * sent.
 * POST  Body: { modelId, fanId, chatterName, messageText }
 */
export async function POST(req: NextRequest) {
  try {
    const { modelId, fanId, chatterName, messageText } = await req.json();
    if (!modelId || !fanId || !chatterName || !messageText) {
      return NextResponse.json(
        { error: "Missing modelId, fanId, chatterName, or messageText" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.from("crm_onlyfans_sent_log").insert({
      model_id: modelId,
      fan_id: String(fanId),
      chatter_name: chatterName,
      message_text: messageText,
    });
    if (error) throw error;

    return NextResponse.json({ status: "success" }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error("[LOG-SENT-MESSAGE] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to log sent message" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/**
 * Returns the ordered send log for a (modelId, fanId) pair, so every
 * viewer's page can label each real message bubble with who actually sent
 * it (matched in order by text, done client-side in the injected script).
 * GET ?modelId=&fanId=
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");
    const fanId = searchParams.get("fanId");
    if (!modelId || !fanId) {
      return NextResponse.json(
        { error: "Missing modelId or fanId" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("crm_onlyfans_sent_log")
      .select("chatter_name, message_text, sent_at")
      .eq("model_id", modelId)
      .eq("fan_id", fanId)
      .order("sent_at", { ascending: true })
      .limit(500);
    if (error) throw error;

    return NextResponse.json({ status: "success", entries: data || [] }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error("[LOG-SENT-MESSAGE] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Failed to fetch sent log" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
