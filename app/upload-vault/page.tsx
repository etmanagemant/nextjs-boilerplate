import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import UploadVaultClient from "@/components/layout/UploadVaultClient";

export const dynamic = "force-dynamic";

export default async function UploadVaultPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, { data: crm_models }, { data: mappings }] = await Promise.all([
    getCurrentProfile(user.id),
    supabase
      .from("crm_model_sessions")
      .select("model_id")
      .eq("is_active", true)
      .order("model_id", { ascending: true }),
    supabase.from("crm_vault_fan_mapping").select("model_id, vault_fan_label"),
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
    <UploadVaultClient
      userId={user.id}
      userRole={userRole}
      connectedModels={connectedModels}
      initialMappings={mappings || []}
    />
  );
}
