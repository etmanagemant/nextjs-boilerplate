// lib/authz.ts
import { createClient } from "@/utils/supabase/server";

export type Role = "admin" | "chatter";

export async function getCurrentRole(): Promise<Role | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return null;

  // Holt die Rolle aus deiner existierenden 'profiles' Tabelle
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !profile) return null;
  
  return (profile.role as Role) ?? null;
}
