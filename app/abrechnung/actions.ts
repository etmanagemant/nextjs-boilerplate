"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// Speichert die optionalen Zahlungsdaten des Chatters
export async function updateChatterBillingDetails(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const address = formData.get("rechnungs_adresse") as string;
  const taxId = formData.get("steuer_id") as string;
  const method = formData.get("zahlungs_methode") as string;
  const details = formData.get("zahlungs_details") as string;

  await supabase.from("profiles").update({
    rechnungs_adresse: address ? address.trim() : null,
    steuer_id: taxId ? taxId.trim() : null,
    zahlungs_methode: method,
    zahlungs_details: details ? details.trim() : null
  }).eq("user_id", user.id);

  revalidatePath("/abrechnung");
}

// Speichert die optionalen Stammdaten der Agentur (Admin)
export async function updateAgencySettings(formData: FormData) {
  const supabase = await createClient();
  const name = formData.get("agency_name") as string;
  const address = formData.get("address") as string;
  const taxId = formData.get("tax_id") as string;
  const bank = formData.get("bank_details") as string;

  await supabase.from("agency_settings").update({
    agency_name: name ? name.trim() : "ET Management",
    address: address ? address.trim() : null,
    tax_id: taxId ? taxId.trim() : null,
    bank_details: bank ? bank.trim() : null
  }).eq("id", 1);

  revalidatePath("/buchhaltung");
}
