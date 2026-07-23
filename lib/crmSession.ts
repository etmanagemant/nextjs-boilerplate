import type { SupabaseClient } from "@supabase/supabase-js";
import { vpsFetch } from "@/lib/vpsClient";

/**
 * Disconnect a model everywhere: clear the stored cookies in Supabase (so a
 * disconnect never leaves the previous login's data behind) and close its
 * live browser on the VPS (wipes the on-disk Chrome profile too). Used both
 * for the manual "Disconnect" button and for auto-disconnecting a session
 * OnlyFans has invalidated (e.g. after a platform update forces re-login).
 */
export async function disconnectModelSession(
  supabase: SupabaseClient,
  modelId: string,
  reason: string = "user_initiated"
) {
  const { error } = await supabase
    .from("crm_model_sessions")
    .update({
      is_active: false,
      auth_cookies: null,
      last_verified_at: new Date().toISOString(),
    })
    .eq("model_id", modelId);

  try {
    await vpsFetch("/disconnect", {
      method: "POST",
      body: JSON.stringify({ modelId }),
    });
  } catch (vpsErr) {
    // Not fatal - DB state already reflects "disconnected"
    console.warn(`[DISCONNECT] VPS cleanup failed for ${modelId} (${reason}):`, vpsErr);
  }

  return { error };
}
