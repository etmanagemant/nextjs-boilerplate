"use server";

import { createClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
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

// Task #80: optional second role (e.g. a Chatter who also clocks in as
// Moderator) - kept as its own action/column (profiles.secondary_role)
// rather than touching updateMitarbeiterRolle, so the primary role and its
// existing role === "x" checks everywhere else stay untouched.
export async function updateMitarbeiterZweitrolle(formData: FormData) {
  const targetUserId = formData.get("user_id");
  const neueZweitrolle = (formData.get("zweitrolle") as string) || "";
  if (targetUserId) {
    const supabaseServer = await createClient();
    await supabaseServer.from("profiles").update({ secondary_role: neueZweitrolle || null }).eq("user_id", targetUserId);
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
  const userId = formData.get("user_id") as string;
  if (userId) {
    const supabaseServer = await createClient();
    await supabaseServer.from("profiles").delete().eq("user_id", userId);

    // Löscht auch den echten Auth-Account - vorher blieb der beim Löschen
    // hier nur "profiles" los, der Login existierte bei Supabase weiter.
    // Kam die Person später zurück und hat sich mit derselben E-Mail neu
    // registriert, tat Supabase (aus Anti-Enumeration-Gründen) nur so als
    // ob's geklappt hätte, ohne wirklich einen neuen Account/Profile
    // anzulegen - jetzt kann dieselbe E-Mail nach dem Löschen hier
    // problemlos neu registriert werden.
    try {
      const adminClient = createSupabaseAdminClient();
      await adminClient.auth.admin.deleteUser(userId);
    } catch (err) {
      console.error("Error deleting auth user:", err);
    }

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

// Rechte-Kontrollzentrum: grants (or revokes) one role's access to one
// feature key on top of whatever that role already gets by default -
// admin/content-manager are unaffected (always full access via
// isAdminTierRole(), see lib/roles.ts). RLS on crm_role_permissions
// already restricts writes to the literal admin role, matching this
// page's own gate - same pattern as every other action in this file.
export async function updateRolePermission(formData: FormData) {
  const role = formData.get("role") as string;
  const featureKey = formData.get("feature_key") as string;
  const enabled = formData.get("enabled") === "true";

  if (role && featureKey) {
    const supabaseServer = await createClient();
    await supabaseServer.from("crm_role_permissions").upsert(
      { role, feature_key: featureKey, enabled, updated_at: new Date().toISOString() },
      { onConflict: "role,feature_key" }
    );
    revalidatePath("/management");
  }
}

// Per-user override on top of updateRolePermission above - "inherit"
// removes any override row (falls back to the role's own setting),
// "on"/"off" force it for this one person regardless of their role.
// See CRM_USER_PERMISSIONS_SETUP.sql for the table/policies.
export async function updateUserPermission(formData: FormData) {
  const userId = formData.get("user_id") as string;
  const featureKey = formData.get("feature_key") as string;
  const mode = formData.get("mode") as string;

  if (userId && featureKey && mode) {
    const supabaseServer = await createClient();
    if (mode === "inherit") {
      await supabaseServer.from("crm_user_permissions").delete().eq("user_id", userId).eq("feature_key", featureKey);
    } else {
      await supabaseServer.from("crm_user_permissions").upsert(
        { user_id: userId, feature_key: featureKey, enabled: mode === "on", updated_at: new Date().toISOString() },
        { onConflict: "user_id,feature_key" }
      );
    }
    revalidatePath("/management");
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
