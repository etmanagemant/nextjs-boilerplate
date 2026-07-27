import type { SupabaseClient } from "@supabase/supabase-js";
import { vpsFetch } from "@/lib/vpsClient";

/**
 * Disconnect a model everywhere: mark it disconnected in Supabase and close
 * its live browser on the VPS (wipes the on-disk Chrome profile too). Used
 * for the manual "Disconnect" button, for auto-disconnecting a session
 * OnlyFans has invalidated (e.g. after a platform update forces re-login),
 * and for OnlyFansViewer's "the VPS browser just isn't there" background
 * check.
 *
 * wipeCookies defaults to true (the manual button and a confirmed-invalid
 * session both want the stored login wiped so a reconnect never inherits
 * stale data). Pass false for the "browser unreachable" case specifically -
 * that fires on ANY reason the VPS-side browser is momentarily gone,
 * including a VPS restart/crash that the server's own auto-reconnect (see
 * autoReconnectAllModels in vps-server.js) can silently recover from using
 * exactly these stored cookies. Wiping them here would mean auto-reconnect
 * only ever works once - CONFIRMED LIVE: this raced auto-reconnect right
 * after a restart and deleted the cookies it had just successfully used.
 */
export async function disconnectModelSession(
  supabase: SupabaseClient,
  modelId: string,
  reason: string = "user_initiated",
  wipeCookies: boolean = true
) {
  const update: Record<string, any> = {
    is_active: false,
    last_verified_at: new Date().toISOString(),
  };
  if (wipeCookies) {
    update.auth_cookies = null;
  }

  const { error } = await supabase.from("crm_model_sessions").update(update).eq("model_id", modelId);

  try {
    // wipeProfile mirrors wipeCookies - CONFIRMED LIVE the VPS route used
    // to always wipe its on-disk Chrome profile regardless of this flag,
    // which meant the "just unreachable right now" case (wipeCookies=false)
    // still destroyed the one restore path that actually works reliably.
    await vpsFetch("/disconnect", {
      method: "POST",
      body: JSON.stringify({ modelId, wipeProfile: wipeCookies }),
    });
  } catch (vpsErr) {
    // Not fatal - DB state already reflects "disconnected"
    console.warn(`[DISCONNECT] VPS cleanup failed for ${modelId} (${reason}):`, vpsErr);
  }

  return { error };
}
