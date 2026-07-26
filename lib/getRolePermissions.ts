import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * This role's explicit feature_key -> enabled rows from crm_role_permissions
 * (Management page's Rechte-Kontrollzentrum). Fetched for EVERY role now,
 * including admin/content-manager - see hasFeatureAccess in lib/roles.ts
 * for how a missing row falls back to the admin-tier default instead.
 */
export async function fetchRolePermissionMap(
  supabase: SupabaseClient,
  role: string | null | undefined
): Promise<Map<string, boolean>> {
  if (!role) return new Map();
  const { data } = await supabase
    .from("crm_role_permissions")
    .select("feature_key, enabled")
    .eq("role", role);
  return new Map((data || []).map((r: any) => [r.feature_key, r.enabled]));
}
