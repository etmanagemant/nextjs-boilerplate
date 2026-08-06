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

// A user can hold a second role at once (profiles.secondary_role, see
// ADD_SECONDARY_ROLE.sql - Task #80, currently only Chatter+Moderator
// combos are exposed in RoleSelect.tsx). Existing role === "x" equality
// checks intentionally keep working against the primary role only; use
// this instead anywhere "does this user have role X at all" is the actual
// question (e.g. which Stechuhr panels to show).
export function hasRole(
  profile: { role?: string | null; secondary_role?: string | null } | null | undefined,
  roleName: string
): boolean {
  if (!profile) return false;
  return profile.role === roleName || profile.secondary_role === roleName;
}

// Every toggle in the Management page's Rechte-Kontrollzentrum grid - page
// access AND specific things inside the live OnlyFans mask (currently just
// whether Model-Notizen is editable vs read-only). Explicitly set per role
// in crm_role_permissions (CRM_ROLE_PERMISSIONS_SETUP.sql); a role with no
// row for a given key falls back to isAdminTierRole() as the default (see
// hasFeatureAccess) - admin/content-manager start fully checked, everyone
// else starts fully unchecked, but the admin can override either way for
// any role, including admin/content-manager themselves.
export const GRANTABLE_FEATURES = [
  { key: "massmessage", label: "Massmessage" },
  { key: "content-plan", label: "Content Plan" },
  { key: "buchhaltung", label: "Buchhaltung" },
  { key: "connection-hub", label: "Connection Hub" },
  { key: "script-vault", label: "Script Vault" },
  { key: "upload-vault", label: "Upload Vault" },
  { key: "onlyfans-model-notes-edit", label: "OnlyFans: Model-Notizen bearbeiten" },
  // OF Inbox Beta Icon-Leiste - gemeldet 2026-08-06 (Task #72 erweitert:
  // "wo Chatter draufklicken können" sollte genauso steuerbar sein wie
  // die Seiten-Zugriffe oben, nicht nur hart im Code auf isAdmin verdrahtet).
  { key: "of-notifications", label: "OnlyFans Beta: Benachrichtigungen (Glocke)" },
  { key: "of-lists", label: "OnlyFans Beta: Listen" },
  { key: "of-vault", label: "OnlyFans Beta: Tresor" },
  { key: "of-fan-search", label: "OnlyFans Beta: Fan suchen" },
  { key: "of-schedules", label: "OnlyFans Beta: Kalender" },
  { key: "of-earnings", label: "OnlyFans Beta: Auszahlungen" },
  { key: "of-massmessage-stats", label: "OnlyFans Beta: Massmessage-Statistik" },
  { key: "of-massmessage-compose", label: "OnlyFans Beta: Massmessage erstellen" },
  { key: "of-script-vault", label: "OnlyFans Beta: Script Vault (im Chat)" },
] as const;

export type GrantableFeatureKey = (typeof GRANTABLE_FEATURES)[number]["key"];

// Roles shown as columns in the Rechte-Kontrollzentrum grid. Admin/content-
// manager are included per the user's explicit ask (so a rule can be
// loosened for them too later) - the actual Hauptadmin (hardcoded user_id/
// email, checked separately everywhere) can never be locked out by this,
// since that check always runs before hasFeatureAccess is ever consulted.
export const PERMISSION_GRID_ROLES = ["chatter", "moderator", "content-manager", "admin"] as const;

/**
 * True if this role/user can use the given feature. Resolution order:
 * an explicit per-USER row (userPermissionMap) always wins first - lets
 * the Hauptadmin override a single person without changing their whole
 * role; then an explicit per-ROLE row (permissionMap); with neither, an
 * admin-tier role defaults to true and everyone else defaults to false.
 * Both maps are this ONE role's/user's feature_key -> enabled rows,
 * fetched once per page/layout render (see lib/getRolePermissions.ts).
 */
export function hasFeatureAccess(
  role: string | null | undefined,
  featureKey: GrantableFeatureKey,
  permissionMap: ReadonlyMap<string, boolean> | Record<string, boolean> = new Map(),
  userPermissionMap?: ReadonlyMap<string, boolean> | Record<string, boolean>
): boolean {
  if (userPermissionMap) {
    const userMap = userPermissionMap instanceof Map ? userPermissionMap : new Map(Object.entries(userPermissionMap));
    if (userMap.has(featureKey)) return !!userMap.get(featureKey);
  }
  const map = permissionMap instanceof Map ? permissionMap : new Map(Object.entries(permissionMap));
  if (map.has(featureKey)) return !!map.get(featureKey);
  return isAdminTierRole(role);
}
