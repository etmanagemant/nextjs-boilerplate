// lib/authz.ts
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

export type Role = "admin" | "chatter";

export async function getCurrentRole(): Promise<Role | null> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return null;
  return (profile?.role as Role) ?? null;
}