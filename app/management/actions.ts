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
    revalidatePath("/management/crm-connect");
  }
}

// 👤 NEU: Ermöglicht das direkte Ändern des Mitarbeiternamens in der DB
export async function updateMitarbeiterName(formData: FormData) {
  const targetUserId = formData.get("user_id");
  const neuerName = formData.get("full_name") as string;
  if (targetUserId && neuerName) {
    const supabaseServer = await createClient();
    await supabaseServer.from("profiles").update({ full_name: neuerName.trim() }).eq("user_id", targetUserId);
    revalidatePath("/management");
    revalidatePath("/management/crm-connect");
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

export async function updateModelName(formData: FormData) {
  const id = formData.get("id");
  const name = formData.get("name") as string;
  if (id && name) {
    const supabaseServer = await createClient();
    await supabaseServer.from("models").update({ name: name.trim() }).eq("id", id);
    revalidatePath("/management");
  }
}

export async function updateModelAvatar(formData: FormData) {
  const id = formData.get("id");
  const avatarUrl = (formData.get("avatar_url") as string || "").trim();
  if (id) {
    const supabaseServer = await createClient();
    await supabaseServer.from("models").update({ avatar_url: avatarUrl || null }).eq("id", id);
    revalidatePath("/management");
  }
}

export async function deleteMitarbeiter(formData: FormData) {
  const userId = formData.get("user_id");
  if (userId) {
    const supabaseServer = await createClient();
    await supabaseServer.from("profiles").delete().eq("user_id", userId);
    revalidatePath("/management");
    revalidatePath("/management/crm-connect");
  }
}

// 🎯 NEUE ACTION: Aktualisiert Provision (Chatters) oder Stundenhonorar (Moderatoren)
export async function updateMitarbeiterCompensation(formData: FormData) {
  const userId = formData.get("user_id") as string;
  const role = formData.get("role") as string;
  const provision = formData.get("provision_rate");
  const hourlyRate = formData.get("hourly_rate");
  
  if (userId) {
    const supabaseServer = await createClient();
    
    if (role === "moderator" && hourlyRate) {
      // Moderator: Speichere Stundenhonorar
      await supabaseServer.from("profiles").update({ hourly_rate: Number(hourlyRate) }).eq("user_id", userId);
    } else if (provision) {
      // Chatter: Speichere Provision
      await supabaseServer.from("profiles").update({ provision_rate: Number(provision) }).eq("user_id", userId);
    }

    revalidatePath("/management");
    revalidatePath("/management/crm-connect");
  }
}

// 🟢 CRASH-PROOF VERBINDUNG: Liefert jetzt eine reine, ungestörte JSON-Antwort an das Formular
export async function addShift(formData: FormData) {
  const chatterId = formData.get("chatter_id") as string; 
  const dateStr = formData.get("date") as string; 
  const startTime = formData.get("start_time") as string; 
  const endTime = formData.get("end_time") as string;     

  const modelNames = formData.getAll("model_names").map(String);

  if (chatterId && dateStr && startTime && endTime) {
    const supabaseServer = await createClient();
    
    if (modelNames.length > 0) {
      const inserts = modelNames.map(name => {
        const individuelleNachricht = formData.get(`mass_message_${name}`) as string;
        const details = `Mitarbeiter: ${chatterId} | Zeit: ${startTime} - ${endTime} | Model: ${name} | MESSAGE_START:${individuelleNachricht}:MESSAGE_END`;
        const zufallsSlotId = Math.floor(Math.random() * 9999000) + 1000;

        return {
          shift_date: dateStr,
          time_slot_id: zufallsSlotId,
          notes: details
        };
      });

      await supabaseServer.from("shifts").insert(inserts);
    } else {
      const details = `Mitarbeiter: ${chatterId} | Zeit: ${startTime} - ${endTime} | Kein Model`;
      const zufallsSlotId = Math.floor(Math.random() * 9999000) + 1000;

      await supabaseServer.from("shifts").insert([
        { shift_date: dateStr, time_slot_id: zufallsSlotId, notes: details }
      ]);
    }
    
    return { success: true };
  }
  
  return { success: false, error: "Ungültige Formulardaten" };
}
