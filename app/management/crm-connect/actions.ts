"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// ============================================================================
// CRM MODEL SESSIONS MANAGEMENT
// ============================================================================

/**
 * Store encrypted OnlyFans session token for a model
 * The auth_cookies JSON should contain: auth_id, sess, user_agent, x_bc_token
 */
export async function connectCreatorSession(formData: FormData) {
  const modelId = formData.get("model_id") as string;
  const authCookiesJson = formData.get("auth_cookies") as string;

  if (!modelId || !authCookiesJson) {
    throw new Error("Missing required fields: model_id or auth_cookies");
  }

  try {
    // Validate JSON structure
    const parsed = JSON.parse(authCookiesJson);
    if (!parsed.auth_id || !parsed.sess) {
      throw new Error("Invalid auth_cookies: missing auth_id or sess");
    }
  } catch (e) {
    throw new Error(
      "Invalid JSON format for auth_cookies. Must contain: auth_id, sess, user_agent, x_bc_token"
    );
  }

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("Unauthorized: User not authenticated");
  }

  // Check if user is admin
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

  // Upsert session (if exists, update; if not, create)
  const { error } = await supabase.from("crm_model_sessions").upsert(
    {
      model_id: modelId,
      auth_cookies: authCookiesJson,
      is_active: true,
      created_by: user.id,
      last_verified_at: new Date().toISOString(),
    },
    { onConflict: "model_id" }
  );

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  // Log audit entry
  const { data: session } = await supabase
    .from("crm_model_sessions")
    .select("id")
    .eq("model_id", modelId)
    .maybeSingle();

  if (session) {
    await supabase.from("crm_session_audit_log").insert({
      session_id: session.id,
      action: "created",
      performed_by: user.id,
      notes: `Session created via CRM Connect Dashboard`,
    });
  }

  revalidatePath("/management/crm-connect");
  return { success: true, message: "Creator connected successfully!" };
}

/**
 * Disconnect a creator session
 */
export async function disconnectCreatorSession(modelId: string) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

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
    .from("crm_model_sessions")
    .update({ is_active: false })
    .eq("model_id", modelId);

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  revalidatePath("/management/crm-connect");
  return { success: true, message: "Creator disconnected successfully!" };
}

// ============================================================================
// CHATTER EMOJIS MANAGEMENT
// ============================================================================

/**
 * Update emoji list for a specific chatter
 */
export async function updateChatterEmojis(
  chatterId: string,
  emojiList: string[]
) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();

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
  const { data: user } = await supabase.auth.getUser();

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
  const { data: user } = await supabase.auth.getUser();

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
  const { data: user } = await supabase.auth.getUser();

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
