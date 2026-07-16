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
  const { data: oldModels } = await supabase
    .from("models")
    .select("id, name, platform_type")
    .eq("platform_type", "onlyfans");

  if (oldModels && oldModels.length > 0) {
    for (const oldModel of oldModels) {
      // Check if already in crm_model_sessions
      const { data: existing } = await supabase
        .from("crm_model_sessions")
        .select("model_id")
        .eq("model_id", oldModel.id)
        .maybeSingle();

      // If not exists, create it
      if (!existing) {
        await supabase.from("crm_model_sessions").insert({
          model_id: oldModel.id,
          is_active: false, // Not yet connected
          auth_cookies: null,
          last_verified_at: new Date().toISOString(),
          last_synced_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // Now fetch from crm_model_sessions (both active and inactive)
  const { data: connectedModels } = await supabase
    .from("crm_model_sessions")
    .select("model_id, profiles(full_name)")
    .order("model_id", { ascending: true });

  const { data: chatters } = await supabase
    .from("profiles")
    .select("user_id, full_name, role")
    .in("role", ["chatter", "moderator"])
    .order("full_name", { ascending: true });

  // Type safety
  const typedModels: Model[] = (connectedModels || []).map((m: any) => ({
    id: m.model_id,
    name: m.profiles?.full_name || m.model_id,
    platform_type: "onlyfans",
  }));
  const typedChatters: Chatter[] = chatters || [];

  return (
    <CRMConnectClient
      initialModels={typedModels}
      initialChatters={typedChatters}
    />
  );
}
