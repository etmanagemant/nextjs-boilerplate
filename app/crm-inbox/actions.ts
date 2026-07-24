"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// ============================================================================
// INBOX DATA FETCHING
//
// Fan visibility is scoped by model_id, not by chatter_id: multiple chatters
// rotate through the same model across shifts and need to see the same
// shared inbox (matches the only real unique constraint in the DB, which is
// on (model_id, fan_id) - there's no per-chatter uniqueness to key off).
// chatter_id is still recorded on sent messages for attribution.
// ============================================================================

/**
 * Fetch all fans with metadata for a given model (shared across chatters
 * working that model, not owned by whoever happened to sync/reply first).
 */
export async function fetchActiveFans(modelId: string) {
  const supabase = await createClient();

  try {
    const { data: metadata, error: metaError } = await supabase
      .from("crm_fan_metadata")
      .select("fan_id, username, lifetime_value, vip_tier, last_interaction")
      .eq("model_id", modelId)
      .order("last_interaction", { ascending: false });

    if (metaError) throw metaError;
    if (!metadata || metadata.length === 0) return [];

    const fanIds = metadata.map((m) => m.fan_id);

    const { data: unreadData, error: unreadError } = await supabase
      .from("crm_fan_messages")
      .select("fan_id")
      .in("fan_id", fanIds)
      .eq("sender", "fan")
      .eq("is_read", false);

    if (unreadError) throw unreadError;

    const unreadMap = new Map<string, number>();
    unreadData?.forEach((msg) => {
      unreadMap.set(msg.fan_id, (unreadMap.get(msg.fan_id) || 0) + 1);
    });

    return metadata.map((meta) => ({
      id: meta.fan_id,
      username: meta.username || `Fan-${meta.fan_id.slice(0, 8)}`,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${meta.fan_id}`,
      total_revenue: meta.lifetime_value || 0,
      is_vip: meta.vip_tier ? meta.vip_tier !== "standard" : false,
      last_message_at: meta.last_interaction || new Date().toISOString(),
      unread_count: unreadMap.get(meta.fan_id) || 0,
      model_id: modelId,
    }));
  } catch (err) {
    console.error("Error fetching active fans:", err);
    return [];
  }
}

/**
 * Fetch the full conversation with a fan - shared across whichever chatter
 * is currently handling the model, not filtered to "my own" messages.
 */
export async function fetchChatMessages(fanId: string, limit: number = 50) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("crm_fan_messages")
      .select("*")
      .eq("fan_id", fanId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Attach the sending chatter's display name so the thread can show a
    // small "gesendet von X" overlay under each CRM-sent message - multiple
    // chatters can rotate through the same model, so the raw chatter_id
    // alone isn't meaningful in the UI.
    const chatterIds = Array.from(
      new Set(data.filter((m) => m.sender === "chatter" && m.chatter_id).map((m) => m.chatter_id))
    );

    let namesById = new Map<string, string>();
    if (chatterIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", chatterIds);
      namesById = new Map(
        (profiles || []).map((p) => [p.user_id, p.full_name || p.email || "Chatter"])
      );
    }

    return data.map((m) => ({
      ...m,
      chatter_name: m.sender === "chatter" ? namesById.get(m.chatter_id) : undefined,
    }));
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    return [];
  }
}

/**
 * Fetch chatter's personalized emojis
 */
export async function fetchChatterEmojis(chatterId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("crm_chatter_emojis")
      .select("*")
      .eq("chatter_id", chatterId)
      .maybeSingle();

    if (error) throw error;
    return data?.emoji_list || [
      "😊",
      "😂",
      "🔥",
      "❤️",
      "😍",
      "👏",
      "🎉",
    ];
  } catch (err) {
    console.error("Error fetching chatter emojis:", err);
    return ["😊", "😂", "🔥", "❤️", "😍", "👏", "🎉"];
  }
}

/**
 * Fetch script library for a model or chatter
 */
export async function fetchScriptLibrary(
  chatterId: string,
  modelId?: string
) {
  const supabase = await createClient();

  try {
    let query = supabase
      .from("crm_script_library")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter for global scripts or scripts assigned to this chatter
    query = query.or(
      `is_global.eq.true,assigned_to_user.eq.${chatterId}`
    );

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error fetching script library:", err);
    return [];
  }
}

/**
 * Model notes - always the same text no matter which fan chat is open
 * (general context/instructions for that model, not fan-specific).
 */
export async function fetchModelNotes(modelId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("models")
      .select("notes")
      .eq("id", modelId)
      .maybeSingle();

    if (error) throw error;
    return data?.notes || "";
  } catch (err) {
    console.error("Error fetching model notes:", err);
    return "";
  }
}

export async function updateModelNotes(modelId: string, notes: string) {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from("models")
      .update({ notes })
      .eq("id", modelId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to update model notes"
    );
  }
}

/**
 * Fetch fan metadata and notes - scoped by (model_id, fan_id), the only
 * unique key that actually exists on crm_fan_metadata.
 */
export async function fetchFanMetadata(modelId: string, fanId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("crm_fan_metadata")
      .select("*")
      .eq("model_id", modelId)
      .eq("fan_id", fanId)
      .maybeSingle();

    if (error) throw error;
    return data || { notes: "", tags: [], purchase_history: "" };
  } catch (err) {
    console.error("Error fetching fan metadata:", err);
    return { notes: "", tags: [], purchase_history: "" };
  }
}

/**
 * Send a message to a fan
 * 1. Saves locally to crm_fan_messages
 * 2. Attempts to send via OnlyFans API (async, non-blocking)
 */
export async function sendMessage(
  chatterId: string,
  fanId: string,
  messageText: string,
  attachedMediaId?: string
) {
  const supabase = await createClient();

  try {
    // 1. Insert local message first
    const { data: insertedMsg, error: insertError } = await supabase
      .from("crm_fan_messages")
      .insert({
        chatter_id: chatterId,
        fan_id: fanId,
        sender: "chatter",
        message_text: messageText,
        attached_media_id: attachedMediaId || null,
        is_read: true,
        sent_to_platform: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 2. Try to send to OnlyFans via API (non-blocking)
    // This happens in the background - don't wait for it
    (async () => {
      try {
        const apiResponse = await fetch("/api/crm/send-message-to-onlyfans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fanId,
            chatterId,
            messageText,
            localMessageId: insertedMsg.id,
            attachedMediaId: attachedMediaId || null,
          }),
        });

        const result = await apiResponse.json();

        if (result.success && result.sent) {
          // Message was successfully sent to OnlyFans
          console.log("Message sent to OnlyFans:", result.externalMessageId);
        } else {
          // Message saved locally but failed to send - it will retry later
          console.warn("Message saved locally but failed to send to OnlyFans", result);
        }
      } catch (err) {
        console.error("Background send error:", err);
        // Silently fail - message is already saved locally
      }
    })();

    revalidatePath("/crm-inbox");
    return {
      success: true,
      message: "Message saved! Sending to OnlyFans...",
      localMessageId: insertedMsg.id,
      sending: true
    };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to send message"
    );
  }
}

/**
 * Update fan notes in metadata - scoped by (model_id, fan_id).
 */
export async function updateFanNotes(
  modelId: string,
  fanId: string,
  notes: string
) {
  const supabase = await createClient();

  try {
    const { error } = await supabase.from("crm_fan_metadata").upsert(
      {
        model_id: modelId,
        fan_id: fanId,
        notes: notes,
      },
      { onConflict: "model_id,fan_id" }
    );

    if (error) throw error;
    return { success: true, message: "Notes updated!" };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to update notes"
    );
  }
}

/**
 * Mark a fan's messages as read - shared inbox, not chatter-scoped.
 */
export async function markMessagesAsRead(fanId: string) {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from("crm_fan_messages")
      .update({ is_read: true })
      .eq("fan_id", fanId)
      .eq("sender", "fan");

    if (error) throw error;
    revalidatePath("/crm-inbox");
    return { success: true };
  } catch (err) {
    console.error("Error marking as read:", err);
    return { success: false };
  }
}
