import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import ScriptVaultClient from "@/components/layout/ScriptVaultClient";

export const dynamic = "force-dynamic";

export default async function ScriptVaultPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Scripts are model-scoped now (not per-chatter) - every chatter/admin
  // sees the same steps grouped by which model they belong to.
  const [profile, { data: scripts }, { data: steps }, { data: crm_models }] = await Promise.all([
    getCurrentProfile(user.id),
    supabase.from("crm_scripts").select("*").order("created_at", { ascending: false }),
    supabase.from("crm_script_steps").select("*").order("order_index", { ascending: true }),
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
      initialSteps={steps || []}
      userId={user.id}
      userRole={userRole}
      connectedModels={connectedModels}
    />
  );
}
