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

// 🟢 KORRIGIERT: Schreibt jetzt fehlerfrei in deine echte 'shift_assignments' Tabelle aus dem Screenshot
export async function addShift(formData: FormData) {
  // Das Formular liefert uns jetzt die echte user_id (UUID) aus dem Dropdown
  const targetUserId = formData.get("chatter_id") as string; 
  const modelId = formData.get("model_id") ? Number(formData.get("model_id")) : null;
  const startTime = formData.get("start_time") as string; // HH:MM
  const endTime = formData.get("end_time") as string;     // HH:MM

  if (targetUserId && startTime && endTime) {
    const supabaseServer = await createClient();
    
    // Wir bauen das flexible Zeitformat ("14:00 - 22:00") direkt als started_at / ended_at Textkette
    // oder nutzen temporäre Zeitstempel, damit die Stechuhr und der Kalender es lesen können.
    const heuteDatum = formData.get("date") as string; // YYYY-MM-DD
    const isoStart = new Date(`${heuteDatum}T${startTime}:00`).toISOString();
    const isoEnd = new Date(`${heuteDatum}T${endTime}:00`).toISOString();

    // 🟢 TRÄGT ES IN DIE RECHTE TABELLE 'shift_assignments' EIN!
    await supabaseServer.from("shift_assignments").insert([
      {
        shift_id: 1, // System-Platzhalter
        chatter_id: targetUserId, // Übergibt die korrekte, akzeptierte UUID
        model_id: modelId,
        started_at: isoStart,
        ended_at: isoEnd
      }
    ]);
    
    revalidatePath("/management");
    revalidatePath("/");
    revalidatePath("/chatter"); // Aktualisiert sofort die Stechuhr des Mitarbeiters!
  }
}
