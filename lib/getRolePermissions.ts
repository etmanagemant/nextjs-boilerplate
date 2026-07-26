import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The set of feature_key values an admin has explicitly granted this role
 * via the Management page's Rechte-Kontrollzentrum (crm_role_permissions).
 * Only meaningful for non-admin-tier roles (chatter/moderator) - admin/
 * content-manager already get everything through isAdminTierRole() and
 * don't need this fetched at all.
 */
export async function fetchGrantedFeatureKeys(
  supabase: SupabaseClient,
  role: string | null | undefined
): Promise<Set<string>> {
  if (!role) return new Set();
  const { data } = await supabase
    .from("crm_role_permissions")
    .select("feature_key")
    .eq("role", role)
    .eq("enabled", true);
  return new Set((data || []).map((r: any) => r.feature_key));
}
