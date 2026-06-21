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

// 🟢 KORRIGIERT: Schreibt jetzt direkt in deine Tabelle 'shifts'
export async function addShift(formData: FormData) {
  const chatterId = formData.get("chatter_id") as string; 
  const dateStr = formData.get("date") as string; // YYYY-MM-DD
  const startTime = formData.get("start_time") as string; // HH:MM
  const endTime = formData.get("end_time") as string;     // HH:MM

  // Holt alle ausgewählten Models aus den Checkboxen
  const modelNames = formData.getAll("model_names").map(String);

  if (chatterId && dateStr && startTime && endTime) {
    const supabaseServer = await createClient();
    
    // Wir bauen alle Infos (Mitarbeiter, Zeiten, Models) in eine einzige Textkette zusammen,
    // die wir sicher in der Datenbank ablegen können
    const modelText = modelNames.length > 0 ? modelNames.join(", ") : "Kein Model";
    const schichtDetails = `Chatter: ${chatterId} | Zeit: ${startTime} - ${endTime} | Models: ${modelText}`;

    await supabaseServer.from("shifts").insert([
      {
        shift_date: dateStr, // Nutzt deine Spalte 'shift_date'
        time_slot_id: 1,     // Platzhalter für deine Spalte 'time_slot_id'
        notes: schichtDetails // Nutzt eine Textspalte (oder wir legen sie gleich an)
      }
    ]);
    
    revalidatePath("/management");
    revalidatePath("/");
  }
}
