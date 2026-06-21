import { getSupabaseServer } from "@/lib/supabaseServer";

export async function requireAdmin() {
  const supabase = getSupabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  if (!userId) return { ok: false as const };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !profile) return { ok: false as const };
  if (profile.role !== "admin") return { ok: false as const };

  return { ok: true as const };
}