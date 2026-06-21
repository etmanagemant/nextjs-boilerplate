// lib/admin.ts
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function requireAdmin() {
  // 1. Nutzt den neuen, asynchronen Server-Client
  const supabase = await createClient();

  // 2. Holt den aktuellen User
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  // Wenn kein User da ist, direkt zum Login umleiten
  if (userErr || !user || !user.email) {
    redirect("/login?next=/management");
  }

  // 3. Prüft die Rolle in deiner 'mitarbeiter' Tabelle
  const { data: mitarbeiter, error } = await supabase
    .from("mitarbeiter")
    .select("rolle")
    .eq("email", user.email)
    .maybeSingle();

  // Wenn der User kein Admin ist, wird er auf die Startseite geschmissen
  if (error || !mitarbeiter || mitarbeiter.rolle !== "admin") {
    redirect("/");
  }

  // Gibt den validierten Admin-User zurück, falls man ihn in der Page braucht
  return user;
}
