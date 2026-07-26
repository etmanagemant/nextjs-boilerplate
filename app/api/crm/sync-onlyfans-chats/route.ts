import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from "next/server";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sync OnlyFans chats for a specific model - the real data feed behind
 * Native Chat Mode (Task #58), reading OnlyFans' own internal API
 * (discovered live: /api2/v2/chats, /api2/v2/users/list, /api2/v2/chats/
 * {fanId}/messages) via the VPS's /sync-chats route instead of the old
 * broken ONLYFANS_CHATS_ENDPOINT-gated version, which depended on an env
 * var that was never actually set.
 * POST /api/crm/sync-onlyfans-chats
 * Body: { modelId: string, sessionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, sessionId } = body;

    if (!modelId || !sessionId) {
      return NextResponse.json({ error: "Missing modelId or sessionId" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: session, error: sessionError } = await supabase
      .from("crm_model_sessions")
      .select("id")
      .eq("model_id", modelId)
      .eq("id", sessionId)
      .eq("is_active", true)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json({ error: "Session query error: " + sessionError.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: "Session not found or not active" }, { status: 404 });
    }

    // The VPS only needs to deep-fetch a conversation's messages when it's
    // actually moved since last time - tell it what we already have so it
    // can skip the rest (see the request-volume comment on /sync-chats).
    const { data: existingMeta } = await supabase
      .from("crm_fan_metadata")
      .select("fan_id")
      .eq("model_id", modelId);
    const knownFanIds = (existingMeta || []).map((r) => r.fan_id);
    const knownLastMessageIds: Record<string, string> = {};
    if (knownFanIds.length) {
      const { data: lastMsgs } = await supabase
        .from("crm_fan_messages")
        .select("fan_id, external_message_id")
        .in("fan_id", knownFanIds)
        .eq("model_id", modelId)
        .not("external_message_id", "is", null)
        .order("created_at", { ascending: false });
      for (const row of lastMsgs || []) {
        if (!knownLastMessageIds[row.fan_id]) knownLastMessageIds[row.fan_id] = row.external_message_id;
      }
    }

    const vpsResponse = await vpsFetch("/sync-chats", {
      method: "POST",
      body: JSON.stringify({ modelId, knownLastMessageIds }),
    });

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text();
      return NextResponse.json({ error: "VPS sync-chats failed: " + errorText.slice(0, 200) }, { status: 502 });
    }

    const vpsResult = await vpsResponse.json();

    if (vpsResult.status === "no_live_session") {
      return NextResponse.json({
        status: "success",
        message: "No live session open for this model right now - skipped",
        fansCount: 0,
        messagesCount: 0,
        skipped: true,
        timestamp: new Date().toISOString(),
      });
    }

    if (vpsResult.status !== "success") {
      return NextResponse.json({ error: vpsResult.error || "VPS sync-chats failed" }, { status: 502 });
    }

    const conversations: any[] = vpsResult.conversations || [];
    let fanCount = 0;
    let messageCount = 0;

    for (const conv of conversations) {
      if (!conv.fanId) continue;
      fanCount++;

      const metaUpdate: Record<string, any> = {
        fan_id: conv.fanId,
        model_id: modelId,
        last_interaction: new Date().toISOString(),
      };
      if (conv.name || conv.username) metaUpdate.username = conv.name || conv.username;
      if (conv.avatarUrl) metaUpdate.avatar_url = conv.avatarUrl;

      await supabase.from("crm_fan_metadata").upsert(metaUpdate, { onConflict: "model_id,fan_id" });

      for (const msg of conv.messages || []) {
        if (!msg.id) continue;

        const { data: existing } = await supabase
          .from("crm_fan_messages")
          .select("id")
          .eq("external_message_id", msg.id)
          .maybeSingle();
        if (existing) continue;

        const { error: insertError } = await supabase.from("crm_fan_messages").insert({
          fan_id: conv.fanId,
          model_id: modelId,
          chatter_id: null,
          external_message_id: msg.id,
          message_text: msg.text || "",
          sender: msg.isFromModel ? "chatter" : "fan",
          is_read: msg.isFromModel ? true : false,
          price: msg.price || null,
          media_refs: msg.media && msg.media.length ? msg.media : null,
          created_at: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
        });

        if (!insertError) messageCount++;
      }
    }

    await supabase.from("crm_model_sessions").update({ last_synced_at: new Date().toISOString() }).eq("id", sessionId);

    return NextResponse.json({
      status: "success",
      message: "OnlyFans chats synced successfully",
      fansCount: fanCount,
      messagesCount: messageCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SYNC] Fatal error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
