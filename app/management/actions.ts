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

// 🟢 ABSOLUT FEHLERFREI: Erstellt saubere, unabhängige Zeilen in 'shifts'
export async function addShift(formData: FormData) {
  const chatterId = formData.get("chatter_id") as string; 
  const dateStr = formData.get("date") as string; 
  const startTime = formData.get("start_time") as string; 
  const endTime = formData.get("end_time") as string;     

  const modelNames = formData.getAll("model_names").map(String);

  if (chatterId && dateStr && startTime && endTime) {
    const supabaseServer = await createClient();
    
    if (modelNames.length > 0) {
      // Erstellt für jedes ausgewählte Model eine eigene, saubere Zeile
      // PostgreSQL vergibt die IDs vollautomatisch im Hintergrund ohne jeden Konflikt!
      const inserts = modelNames.map(name => {
        const individuelleNachricht = formData.get(`mass_message_${name}`) as string;
        const details = `Mitarbeiter: ${chatterId} | Zeit: ${startTime} - ${endTime} | Model: ${name} | MESSAGE_START:${individuelleNachricht}:MESSAGE_END`;
        
        return {
          shift_date: dateStr,
          notes: details
        };
      });

      await supabaseServer.from("shifts").insert(inserts);
    } else {
      // Ohne Model
      const details = `Mitarbeiter: ${chatterId} | Zeit: ${startTime} - ${endTime} | Kein Model`;
      await supabaseServer.from("shifts").insert([{ shift_date: dateStr, notes: details }]);
    }
    
    revalidatePath("/management");
    revalidatePath("/");
  }
}
