// lib/requireAdmin.ts
import { requireAdmin as validatedAdmin } from "./admin";

// Wir leiten einfach die bereits reparierte Funktion aus admin.ts weiter
export async function requireAdmin() {
  return await validatedAdmin();
}
