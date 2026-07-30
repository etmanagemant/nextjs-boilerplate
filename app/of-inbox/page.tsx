import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import OfInboxClient from "@/components/layout/OfInboxClient";

export const dynamic = "force-dynamic";

/**
 * Experimental API-driven OnlyFans inbox - reads/sends via our own signed
 * requests (see /of-chats, /of-messages, /of-send in app/vps-server.js)
 * instead of VNC screen-streaming. Kept as its own route, separate from
 * the existing VNC-based /crm-inbox, so nothing about the working VNC
 * flow changes while this is still being built out (no overlay features -
 * dark mode/sent-by/script-vault-button/fan-spend-ring/PPV-detector - yet,
 * those need to become native components here, not ported as-is).
 */
export default async function OfInboxPage() {
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
  const { data: crm_models } = await adminSupabase
    .from("crm_model_sessions")
    .select("model_id")
    .eq("is_active", true)
    .order("model_id", { ascending: true });

  const modelIds = (crm_models || []).map((m: any) => m.model_id);
  let connectedModels: { id: string; name: string }[] = [];
  if (modelIds.length > 0) {
    const { data: modelDetails } = await adminSupabase
      .from("models")
      .select("id, name")
      .in("id", modelIds);
    const detailsMap = new Map(modelDetails?.map((m: any) => [m.id, m]) || []);
    connectedModels = modelIds.map((id: string) => ({ id, name: detailsMap.get(id)?.name || id }));
  }

  return <OfInboxClient connectedModels={connectedModels} isAdmin={isAdminTierRole(profile?.role) || user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4"} />;
}
