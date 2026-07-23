import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import ScriptVaultClient from "@/components/layout/ScriptVaultClient";

export const dynamic = "force-dynamic";

export default async function ScriptVaultPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Get user role, and the independent lists this page needs, in parallel
  const [profile, { data: scripts }, { data: chatters }, { data: crm_models }] = await Promise.all([
    getCurrentProfile(user.id),
    supabase
      .from("crm_script_library")
      .select("*")
      .or(`is_global.eq.true,assigned_to_user.eq.${user.id}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("user_id, full_name, role")
      .in("role", ["chatter", "moderator"])
      .order("full_name", { ascending: true }),
    supabase
      .from("crm_model_sessions")
      .select("model_id")
      .eq("is_active", true)
      .order("model_id", { ascending: true }),
  ]);

  const userRole = profile?.role || "guest";

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
