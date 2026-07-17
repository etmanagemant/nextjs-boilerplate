import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import UploadVaultClient from "@/components/layout/UploadVaultClient";

export const dynamic = "force-dynamic";

export default async function UploadVaultPage() {
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

  // Fetch media for this user from crm_vault_media
  const { data: media } = await supabase
    .from("crm_vault_media")
    .select("*")
    .eq("chatter_id", user.id)
    .order("created_at", { ascending: false });

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
    <UploadVaultClient
      initialMedia={media || []}
      userId={user.id}
      userRole={userRole}
      userName={profile?.full_name || user.email || "Chatter"}
      connectedModels={connectedModels}
    />
  );
}
