import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import ModelWorkspaceClient from "@/components/layout/ModelWorkspaceClient";

export const dynamic = "force-dynamic";

export default async function ModelWorkspacePage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile(user.id);
  if (profile?.role !== "model") {
    redirect("/");
  }

  const { data: model } = await supabase
    .from("models")
    .select("id, name")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  let vaultFanLabel: string | null = null;
  if (model) {
    const { data: mapping } = await supabase
      .from("crm_vault_fan_mapping")
      .select("vault_fan_label")
      .eq("model_id", model.id)
      .maybeSingle();
    vaultFanLabel = mapping?.vault_fan_label || null;
  }

  return (
    <ModelWorkspaceClient
      model={model || null}
      vaultFanLabel={vaultFanLabel}
    />
  );
}
