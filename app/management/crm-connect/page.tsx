import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CRMConnectClient from "@/components/layout/CRMConnectClient";

export const dynamic = "force-dynamic";

interface Model {
  id: string;
  name: string;
  platform_type: string;
}

interface Chatter {
  user_id: string;
  full_name: string;
  role: string;
}

export default async function CRMConnectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 🔐 SECURITY: Redirect if not authenticated
  if (!user) {
    redirect("/login");
  }

  // 🔐 SECURITY: Check admin status
  let isAdmin = false;
  if (
    user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
    user.email === "etmanagement@gmail.com"
  ) {
    isAdmin = true;
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.role === "admin") {
      isAdmin = true;
    }
  }

  if (!isAdmin) {
    redirect("/");
  }

  // 📊 FETCH DATA
  // First: Migrate old models to crm_model_sessions if not already there
  try {
    const { data: oldModels, error: oldModelsError } = await supabase
      .from("models")
      .select("id, name, platform_type")
      .eq("platform_type", "onlyfans");

    if (oldModelsError) {
      console.error("Error fetching old models:", oldModelsError);
    }

    if (oldModels && oldModels.length > 0) {
      console.log(`Found ${oldModels.length} models to migrate:`, oldModels);
      
      for (const oldModel of oldModels) {
        // Check if already in crm_model_sessions
        const { data: existing, error: checkError } = await supabase
          .from("crm_model_sessions")
          .select("model_id")
          .eq("model_id", oldModel.id)
          .maybeSingle();

        if (checkError) {
          console.error(`Error checking model ${oldModel.id}:`, checkError);
          continue;
        }

        // If not exists, create it
        if (!existing) {
          const { error: insertError } = await supabase.from("crm_model_sessions").insert({
            model_id: oldModel.id,
            is_active: false, // Not yet connected
            auth_cookies: null,
            last_verified_at: new Date().toISOString(),
            last_synced_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          if (insertError) {
            console.error(`Error inserting model ${oldModel.id}:`, insertError);
          } else {
            console.log(`Migrated model: ${oldModel.id}`);
          }
        } else {
          console.log(`Model ${oldModel.id} already exists`);
        }
      }
    }
  } catch (err) {
    console.error("Migration error:", err);
  }

  // Now fetch from crm_model_sessions (both active and inactive)
  const { data: connectedModels, error: fetchError } = await supabase
    .from("crm_model_sessions")
    .select("model_id")
    .order("model_id", { ascending: true });

  if (fetchError) {
    console.error("Error fetching models:", fetchError);
  }

  // Type safety - use model_id as both id and name for now
  let typedModels: Model[] = (connectedModels || []).map((m: any) => ({
    id: m.model_id,
    name: m.model_id, // Use model_id as display name (will be updated when connected)
    platform_type: "onlyfans",
  }));

  // FALLBACK: If crm_model_sessions is empty, try old models table
  if (!connectedModels || connectedModels.length === 0) {
    console.log("crm_model_sessions empty, loading from models table as fallback...");
    const { data: fallbackModels } = await supabase
      .from("models")
      .select("id, name, platform_type")
      .eq("platform_type", "onlyfans")
      .order("name", { ascending: true });

    if (fallbackModels && fallbackModels.length > 0) {
      console.log(`Found ${fallbackModels.length} models in fallback`);
      typedModels = fallbackModels.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        platform_type: m.platform_type,
      }));
    }
  }

  const { data: chatters } = await supabase
    .from("profiles")
    .select("user_id, full_name, role")
    .in("role", ["chatter", "moderator"])
    .order("full_name", { ascending: true });

  const typedChatters: Chatter[] = chatters || [];

  return (
    <CRMConnectClient
      initialModels={typedModels}
      initialChatters={typedChatters}
    />
  );
}
