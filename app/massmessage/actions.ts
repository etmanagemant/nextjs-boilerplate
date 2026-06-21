"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function deleteMassMessage(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id");

  if (id) {
    // Holt die aktuelle Schicht, um das bestehende JSON zu lesen
    const { data: shift } = await supabase.from("shifts").select("notes").eq("id", id).single();
    
    if (shift && shift.notes) {
      const parsed = JSON.parse(shift.notes);
      // Leert nur das Nachrichtenfeld im JSON
      parsed.nachricht = "";

      await supabase.from("shifts").update({ notes: JSON.stringify(parsed) }).eq("id", id);
      revalidatePath("/massmessage");
    }
  }
}

export async function updateMassMessage(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id");
  const messageText = formData.get("message_text") as string;

  if (id && messageText) {
    const { data: shift } = await supabase.from("shifts").select("notes").eq("id", id).single();
    
    if (shift && shift.notes) {
      const parsed = JSON.parse(shift.notes);
      // Aktualisiert den Nachrichtentext im JSON
      parsed.nachricht = messageText.trim();

      await supabase.from("shifts").update({ notes: JSON.stringify(parsed) }).eq("id", id);
      revalidatePath("/massmessage");
    }
  }
}
