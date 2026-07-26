import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import { fetchRolePermissionMap } from "@/lib/getRolePermissions";
import LiveModelClient from "@/components/layout/LiveModelClient";

export const dynamic = "force-dynamic";

// Standalone single-model live view - what a model tab's right-click "In
// neuem Tab öffnen" opens. Deliberately a separate route from /crm-inbox
// (not just that page with a param) so app/layout.tsx can detect the
// "/live/" prefix and skip the sidebar/top bar/model-tabs-bar entirely -
// this tab is meant to be dragged onto its own monitor showing nothing but
// the live view itself.
export default async function LiveModelPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile(user.id);
  const userRole = profile?.role || "guest";
  const isAllowed =
    ["chatter", "moderator", "admin", "content-manager"].includes(userRole) ||
    user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
    user.email === "etmanagement@gmail.com" ||
    user.email === "etmanagemant@gmail.com";

  if (!isAllowed) {
    redirect("/");
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: modelRow } = await adminSupabase
    .from("models")
    .select("id, name")
    .eq("id", modelId)
    .maybeSingle();

  if (!modelRow) {
    redirect("/crm-inbox");
  }

  const permMap = await fetchRolePermissionMap(supabase, userRole);

  return (
    <LiveModelClient
      modelId={modelRow.id}
      modelName={modelRow.name}
      chatterId={user.id}
      userRole={userRole}
      permissions={Object.fromEntries(permMap)}
    />
  );
}
