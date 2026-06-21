// lib/admin.ts
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function requireAdmin() {
  const supabase = getSupabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return { ok: false as const, reason: "not-authenticated" };

  const userId = userData.user.id;

  // Beispiel: Tabelle profiles(user_id uuid, role text)
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (profErr) return { ok: false as const, reason: "profile-error" };

  if (profile?.role !== "admin") return { ok: false as const, reason: "not-admin" };

  return { ok: true as const };
}