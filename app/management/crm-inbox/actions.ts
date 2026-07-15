"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// ============================================================================
// INBOX DATA FETCHING
// ============================================================================

/**
 * Fetch all active fans for the chatter (read from messages/sessions)
 */
export async function fetchActiveFans(chatterId: string) {
  const supabase = await createClient();

  try {
    // This would typically read from a messages table or fan sessions table
    // For now, returning a placeholder that can be connected to your actual data
    const { data, error } = await supabase
      .from("crm_fan_messages")
      .select(
        "fan_id, username, avatar_url, total_revenue, is_vip, last_message_at, unread_count"
      )
      .eq("chatter_id", chatterId)
      .order("last_message_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error fetching active fans:", err);
    return [];
  }
}

/**
 * Fetch chat messages for a specific fan
 */
export async function fetchChatMessages(
  chatterId: string,
  fanId: string,
  limit: number = 50
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("crm_fan_messages")
      .select("*")
      .eq("chatter_id", chatterId)
      .eq("fan_id", fanId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data || [];
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
 * Fetch fan metadata and notes
 */
export async function fetchFanMetadata(chatterId: string, fanId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("crm_fan_metadata")
      .select("*")
      .eq("chatter_id", chatterId)
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
 */
export async function sendMessage(
  chatterId: string,
  fanId: string,
  messageText: string,
  attachedMediaId?: string
) {
  const supabase = await createClient();

  try {
    const { error } = await supabase.from("crm_fan_messages").insert({
      chatter_id: chatterId,
      fan_id: fanId,
      sender: "chatter",
      message_text: messageText,
      attached_media_id: attachedMediaId || null,
      is_read: true,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    revalidatePath("/management/crm-inbox");
    return { success: true, message: "Message sent!" };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to send message"
    );
  }
}

/**
 * Update fan notes in metadata
 */
export async function updateFanNotes(
  chatterId: string,
  fanId: string,
  notes: string
) {
  const supabase = await createClient();

  try {
    const { error } = await supabase.from("crm_fan_metadata").upsert(
      {
        chatter_id: chatterId,
        fan_id: fanId,
        notes: notes,
      },
      { onConflict: "chatter_id,fan_id" }
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
 * Mark messages as read
 */
export async function markMessagesAsRead(
  chatterId: string,
  fanId: string
) {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from("crm_fan_messages")
      .update({ is_read: true })
      .eq("chatter_id", chatterId)
      .eq("fan_id", fanId)
      .eq("sender", "fan");

    if (error) throw error;
    revalidatePath("/management/crm-inbox");
    return { success: true };
  } catch (err) {
    console.error("Error marking as read:", err);
    return { success: false };
  }
}
