import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import OfInboxClient from "@/components/layout/OfInboxClient";

export const dynamic = "force-dynamic";

/**
 * Standalone single-model OF Inbox (Beta) view - what a model tab's
 * right-click "In neuem Tab öffnen" opens for OF Inbox (Beta), mirroring
 * /live/[modelId]'s role for the VNC-based /crm-inbox. Deliberately its
 * own route (not just /of-inbox with a param) so app/layout.tsx can
 * detect the "/live-of-inbox/" prefix and skip the sidebar/top bar
 * entirely - a chatter running 2 models wants this popped into its own
 * tab/monitor showing nothing but the chat UI itself, not the full CRM
 * chrome again.
 */
export default async function LiveOfInboxPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile(user.id);
  const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
    user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
    user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
  if (!isAllowed) {
    redirect("/");
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: modelRow } = await adminSupabase
    .from("models")
    .select("id, name, avatar_url")
    .eq("id", modelId)
    .maybeSingle();

  if (!modelRow) {
    redirect("/of-inbox");
  }

  return (
    <OfInboxClient
      connectedModels={[{ id: modelRow.id, name: modelRow.name, avatar_url: modelRow.avatar_url || null }]}
      isAdmin={isAdminTierRole(profile?.role) || user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4"}
      chatterId={user.id}
      userEmail={user.email || ""}
      allShifts={[]}
    />
  );
}
