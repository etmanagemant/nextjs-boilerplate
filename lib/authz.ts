// lib/authz.ts
import { createClient } from "@/utils/supabase/server";

export type Role = "admin" | "chatter" | "moderator";

export async function getCurrentRole(): Promise<Role | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user || !user.email) return null;

    // 🟢 DEIN HARDCODE: Wenn du das bist, direkt Admin zurückgeben – spart die DB-Suche!
    if (user.email === "DEINE_ECHTE_EMAIL@HIER_EINTRAGEN.de") {
      return "admin";
    }

    // Für alle anderen sichere Abfrage ohne maybeSingle()-Absturzgefahr
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id);

    if (error || !profiles || profiles.length === 0) {
      return "chatter"; // Fallback, falls kein Profil existiert
    }
    
    const role = profiles[0].role as Role;
    if (role === "moderator" || role === "admin") {
      return role;
    }
    
    return "chatter";
  } catch (e) {
    // Falls irgendwas abstürzt, fangen wir es ab
    return "chatter";
  }
}
