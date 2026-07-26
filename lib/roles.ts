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
