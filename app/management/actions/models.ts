"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/requireAdmin";

export async function addModelAction(formData: FormData) {
  const res = await requireAdmin();
  if (!res.ok) return { ok: false as const, error: "Unauthorized" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false as const, error: "Name is required" };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("models")
    .insert({ name });

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/management");
  return { ok: true as const };
}