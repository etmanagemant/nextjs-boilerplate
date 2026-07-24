"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// ============================================================================
// CRM MODEL SESSIONS MANAGEMENT
// ============================================================================

// Model connect/disconnect now goes through /api/crm/browser-login/* (live
// browser session on the VPS) instead of manual cookie paste - see
// components/layout/BrowserLoginStreamComponent.tsx.

// ============================================================================
// CHATTER EMOJIS MANAGEMENT
// ============================================================================

/**
 * Update emoji list for a specific chatter. A chatter may edit their own
 * quick-emoji bar directly (self-service, no admin needed); editing someone
 * else's list still requires admin - used by the crm-connect management page.
 */
export async function updateChatterEmojis(
  chatterId: string,
  emojiList: string[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("Unauthorized: User not authenticated");
  }

  if (user.id !== chatterId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      profile?.role !== "admin" &&
      user.id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4"
    ) {
      throw new Error("Unauthorized: Admin access required");
    }
  }

  const { error } = await supabase.from("crm_chatter_emojis").upsert(
    {
      chatter_id: chatterId,
      emoji_list: emojiList,
    },
    { onConflict: "chatter_id" }
  );

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  revalidatePath("/management/crm-connect");
  return { success: true, message: "Emojis updated successfully!" };
}

// ============================================================================
// CRM SCRIPT LIBRARY MANAGEMENT
// ============================================================================

export interface ScriptLibraryItem {
  title: string;
  scriptContent: string;
  category: "greeting" | "offer" | "follow_up" | "custom";
  isGlobal: boolean;
  assignedToUser?: string;
}

/**
 * Add new script to library
 */
export async function addScriptToLibrary(scriptData: ScriptLibraryItem) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    profile?.role !== "admin" &&
    user.id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4"
  ) {
    throw new Error("Unauthorized: Admin access required");
  }

  const { error } = await supabase.from("crm_script_library").insert({
    title: scriptData.title,
    script_content: scriptData.scriptContent,
    category: scriptData.category,
    is_global: scriptData.isGlobal,
    assigned_to_user: scriptData.assignedToUser || null,
    created_by: user.id,
  });

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  revalidatePath("/management/crm-connect");
  return { success: true, message: "Script added successfully!" };
}

/**
 * Delete script from library
 */
export async function deleteScriptFromLibrary(scriptId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    profile?.role !== "admin" &&
    user.id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4"
  ) {
    throw new Error("Unauthorized: Admin access required");
  }

  const { error } = await supabase
    .from("crm_script_library")
    .delete()
    .eq("id", scriptId);

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  revalidatePath("/management/crm-connect");
  return { success: true, message: "Script deleted successfully!" };
}

/**
 * Update existing script
 */
export async function updateScript(
  scriptId: string,
  scriptData: Partial<ScriptLibraryItem>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    profile?.role !== "admin" &&
    user.id !== "35498c92-2c4d-4720-a6f7-cc187a4c5fc4"
  ) {
    throw new Error("Unauthorized: Admin access required");
  }

  const updateData: Record<string, any> = {};
  if (scriptData.title) updateData.title = scriptData.title;
  if (scriptData.scriptContent)
    updateData.script_content = scriptData.scriptContent;
  if (scriptData.category) updateData.category = scriptData.category;
  if (scriptData.isGlobal !== undefined) updateData.is_global = scriptData.isGlobal;
  if (scriptData.assignedToUser !== undefined)
    updateData.assigned_to_user = scriptData.assignedToUser;

  const { error } = await supabase
    .from("crm_script_library")
    .update(updateData)
    .eq("id", scriptId);

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  revalidatePath("/management/crm-connect");
  return { success: true, message: "Script updated successfully!" };
}
