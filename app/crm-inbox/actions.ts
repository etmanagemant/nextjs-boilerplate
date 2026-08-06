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

/**
 * No-Go-Liste - strukturiert getrennt von den freien Notizen (2026-08-07,
 * explizit gewuenscht). Gleiches Whole-Array-Replace-Muster wie Fan CRM's
 * preferences: einfacher als einzelne Insert/Delete-Endpunkte fuer eine
 * Liste, die eh nur ein Admin pflegt.
 */
export async function fetchModelNoGoList(modelId: string): Promise<string[]> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("models")
      .select("no_go_list")
      .eq("id", modelId)
      .maybeSingle();

    if (error) throw error;
    return data?.no_go_list || [];
  } catch (err) {
    console.error("Error fetching model no-go list:", err);
    return [];
  }
}

export async function updateModelNoGoList(modelId: string, list: string[]) {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from("models")
      .update({ no_go_list: list })
      .eq("id", modelId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to update model no-go list"
    );
  }
}
