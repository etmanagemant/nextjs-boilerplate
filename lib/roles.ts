// A "content-manager" account gets the exact same permissions and view as
// "admin" everywhere except the Management page itself (Mitarbeiter- und
// Rollen-Verwaltung) - the one deliberate carve-out the user asked for, so
// there's still a single distinguished "Hauptadmin" even though day-to-day
// access is otherwise identical. Anywhere a page/component used to check
// role === "admin" to grant a privilege, it should check isAdminTierRole()
// instead - EXCEPT app/management/page.tsx, which must keep checking the
// literal "admin" role on purpose.
//
// No imports here on purpose - this needs to be safely importable from
// both server-only files (lib/crmAdmin.ts) and "use client" components
// (GlobalSidebar, WeeklyCalender) alike.
export const ADMIN_TIER_ROLES = ["admin", "content-manager"] as const;

export function isAdminTierRole(role: string | null | undefined): boolean {
  return !!role && (ADMIN_TIER_ROLES as readonly string[]).includes(role);
}

// Pages a non-admin-tier role (chatter/moderator) can be individually
// granted access to via the Management page's Rechte-Kontrollzentrum -
// see crm_role_permissions (CRM_ROLE_PERMISSIONS_SETUP.sql). Admin/
// content-manager always have all of these already through
// isAdminTierRole() and never need an explicit row here. A missing row
// for (role, key) means "not granted" - nothing is on by default.
export const GRANTABLE_FEATURES = [
  { key: "massmessage", label: "Massmessage" },
  { key: "content-plan", label: "Content Plan" },
  { key: "buchhaltung", label: "Buchhaltung" },
  { key: "connection-hub", label: "Connection Hub" },
  { key: "script-vault", label: "Script Vault" },
  { key: "upload-vault", label: "Upload Vault" },
] as const;

export type GrantableFeatureKey = (typeof GRANTABLE_FEATURES)[number]["key"];

/**
 * True if this role can use the given feature - either because the role
 * is admin-tier (always everything) or because an admin explicitly
 * granted it via the Rechte-Kontrollzentrum. `grantedKeys` is the set of
 * feature_key values with enabled=true for this specific role, fetched
 * once per page/layout render (see app/layout.tsx, app/management/page.tsx).
 */
export function hasFeatureAccess(
  role: string | null | undefined,
  featureKey: GrantableFeatureKey,
  grantedKeys: ReadonlySet<string> | string[] = []
): boolean {
  if (isAdminTierRole(role)) return true;
  const set = grantedKeys instanceof Set ? grantedKeys : new Set(grantedKeys);
  return set.has(featureKey);
}
