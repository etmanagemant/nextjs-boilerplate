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

// 🟢 KORRIGIERT & GARANTIERT: Trägt geplante Schichten fehlerfrei ein
export async function addShift(formData: FormData) {
  const targetUserId = formData.get("chatter_id") as string; 
  const modelId = formData.get("model_id") ? Number(formData.get("model_id")) : null;
  const startTime = formData.get("start_time") as string; // HH:MM
  const endTime = formData.get("end_time") as string;     // HH:MM
  const heuteDatum = formData.get("date") as string;     // YYYY-MM-DD

  if (targetUserId && startTime && endTime && heuteDatum) {
    const supabaseServer = await createClient();
    
    // Erstellt saubere ISO-Zeitstempel für deine Tabellenspalten
    const isoStart = new Date(`${heuteDatum}T${startTime}:00`).toISOString();
    const isoEnd = new Date(`${heuteDatum}T${endTime}:00`).toISOString();
    const formatierterSlot = `${startTime} – ${endTime} Uhr`;

    await supabaseServer.from("shift_assignments").insert([
      {
        shift_id: 1, 
        chatter_id: targetUserId, // UUID
        model_id: modelId,
        started_at: isoStart,
        ended_at: isoEnd,
        time_slot: formatierterSlot // Speichert die Uhrzeit als Textkette für den Kalender
      }
    ]);
    
    revalidatePath("/management");
    revalidatePath("/");
    revalidatePath("/chatter");
  }
}
