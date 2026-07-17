import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import ScriptVaultClient from "@/components/layout/ScriptVaultClient";

export const dynamic = "force-dynamic";

export default async function ScriptVaultPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const userRole = profile?.role || "guest";

  // Fetch scripts (global + user's personal scripts)
  const { data: scripts } = await supabase
    .from("crm_script_library")
    .select("*")
    .or(`is_global.eq.true,assigned_to_user.eq.${user.id}`)
    .order("created_at", { ascending: false });

  // Get all chatters for admin view
  const { data: chatters } = await supabase
    .from("profiles")
    .select("user_id, full_name, role")
    .in("role", ["chatter", "moderator"])
    .order("full_name", { ascending: true });

  // 📊 Fetch connected models for sidebar navigation
  const { data: crm_models } = await supabase
    .from("crm_model_sessions")
    .select("model_id")
    .eq("is_active", true)
    .order("model_id", { ascending: true });

  let connectedModels: any[] = [];
  if (crm_models && crm_models.length > 0) {
    const modelIds = crm_models.map((m: any) => m.model_id);
    const { data: modelDetails } = await supabase
      .from("models")
      .select("id, name")
      .in("id", modelIds);
    const nameMap = new Map(modelDetails?.map((m: any) => [m.id, m.name]) || []);
    connectedModels = crm_models.map((m: any) => ({
      id: m.model_id,
      name: nameMap.get(m.model_id) || m.model_id,
    }));
  }

  return (
    <ScriptVaultClient
      initialScripts={scripts || []}
      chatters={chatters || []}
      userId={user.id}
      userRole={userRole}
      userName={profile?.full_name || user.email || "Chatter"}
      connectedModels={connectedModels}
    />
  );
}
