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

  return (
    <UploadVaultClient
      initialMedia={media || []}
      userId={user.id}
      userRole={userRole}
      userName={profile?.full_name || user.email || "Chatter"}
    />
  );
}
