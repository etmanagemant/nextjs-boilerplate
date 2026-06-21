// app/management/actions.ts
"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateMitarbeiterRolle(formData: FormData) {
  const targetUserId = formData.get("user_id");
  const neueRolle = formData.get("rolle") as string;
  if (targetUserId && neueRolle) {
    const supabaseServer = await createClient();
    await supabaseServer.from("profiles").update({ role: neueRolle }).eq("user_id", targetUserId);
    revalidatePath("/management");
  }
}

export async function addModel(formData: FormData) {
  const name = formData.get("name") as string;
  if (name) {
    const supabaseServer = await createClient();
    await supabaseServer.from("models").insert([{ name }]);
    revalidatePath("/management");
  }
}

export async function deleteModel(formData: FormData) {
  const id = formData.get("id");
  if (id) {
    const supabaseServer = await createClient();
    await supabaseServer.from("models").delete().eq("id", id);
    revalidatePath("/management");
  }
}

// Schichterstellungs-Aktion mit freien Uhrzeiten
export async function addShift(formData: FormData) {
  const chatterId = formData.get("chatter_id") as string;
  const modelId = formData.get("model_id") ? Number(formData.get("model_id")) : null;
  const dateStr = formData.get("date") as string; // YYYY-MM-DD
  
  // 🟢 NEU: Holt die frei gewählten Uhrzeiten
  const startTime = formData.get("start_time") as string; // HH:MM
  const endTime = formData.get("end_time") as string;     // HH:MM

  if (chatterId && dateStr && startTime && endTime) {
    const supabaseServer = await createClient();
    
    // Baut aus Anfang und Ende einen sauberen Text (z.B. "13:00 - 19:30 Uhr")
    const formatierterSlot = `${startTime} – ${endTime} Uhr`;
    
    await supabaseServer.from("shifts").insert([
      {
        chatter_id: chatterId,
        model_id: modelId,
        date: dateStr,
        time_slot: formatierterSlot, // Speichert das Ergebnis flexibel ab
        status: "geplant"
      }
    ]);
    
    revalidatePath("/management");
    revalidatePath("/");
  }
}
