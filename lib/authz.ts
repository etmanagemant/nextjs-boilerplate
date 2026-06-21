// lib/authz.ts
import { createClient } from "@/utils/supabase/server";

export type Role = "admin" | "mitarbeiter" | "chatter";

export async function getCurrentRole(): Promise<Role | null> {
  // 1. Nutzt den neuen, asynchronen Next.js 16 Server-Client
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  // Wenn kein User eingeloggt ist, gibt es keine Rolle
  if (userErr || !user || !user.email) return null;

  // 2. Holt die Rolle aus deiner 'mitarbeiter' Tabelle anhand der E-Mail
  const { data: mitarbeiter, error } = await supabase
    .from("mitarbeiter")
    .select("rolle")
    .eq("email", user.email)
    .maybeSingle();

  if (error || !mitarbeiter) {
    // Fallback: Wenn der User in Supabase existiert, aber noch nicht in der Tabelle steht
    return null;
  }

  return (mitarbeiter.rolle as Role) ?? null;
}
