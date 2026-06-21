"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveMassMessage(formData: FormData) {
  const supabase = await createClient();
  const modelName = formData.get("model_name") as string;
  const messageText = formData.get("message_text") as string;

  if (modelName && messageText) {
    await supabase.from("saved_mass_messages").insert([{ model_name: modelName, message_text: messageText }]);
    revalidatePath("/massmessage");
  }
}

export async function deleteMassMessage(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id");

  if (id) {
    await supabase.from("saved_mass_messages").delete().eq("id", id);
    revalidatePath("/massmessage");
  }
}

export async function updateMassMessage(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id");
  const messageText = formData.get("message_text") as string;

  if (id && messageText) {
    await supabase.from("saved_mass_messages").update({ message_text: messageText }).eq("id", id);
    revalidatePath("/massmessage");
  }
}
