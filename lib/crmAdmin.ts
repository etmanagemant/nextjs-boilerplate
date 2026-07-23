import { createClient } from "@/utils/supabase/server";

const ADMIN_USER_ID = "35498c92-2c4d-4720-a6f7-cc187a4c5fc4";
const ADMIN_EMAILS = ["etmanagement@gmail.com", "etmanagemant@gmail.com"];

/**
 * Resolve the current cookie-session user and whether they're an admin.
 * Shared by every /api/crm/browser-login/* route so the admin-gate logic
 * (hardcoded owner UUID/emails + profiles.role) lives in exactly one place.
 */
export async function getRequestAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, isAdmin: false };

  if (ADMIN_USER_ID === user.id || ADMIN_EMAILS.includes(user.email || "")) {
    return { supabase, user, isAdmin: true };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return { supabase, user, isAdmin: profile?.role === "admin" };
}
