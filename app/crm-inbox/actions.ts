"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Fetch chatter's personalized emojis - used by the OnlyFansViewer's own
 * floating emoji bar overlay on the live VNC view.
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
 * Model notes - used by ModelNotesPanel (Model-Rolle dashboard), not just
 * the removed Native Chat Mode UI - kept here since that's still live.
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
