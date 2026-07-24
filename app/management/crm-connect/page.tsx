import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import CRMConnectClient from "@/components/layout/CRMConnectClient";
import {
  updateMitarbeiterRolle,
  updateMitarbeiterName,
  updateMitarbeiterCompensation,
  deleteMitarbeiter,
} from "@/app/management/actions";

export const dynamic = "force-dynamic";

interface Model {
  id: string;
  name: string;
  platform_type: string;
}

interface Chatter {
  user_id: string;
  full_name: string;
  role: string;
}

interface StaffProfile {
  user_id: string;
  role: string;
  email: string | null;
  full_name: string | null;
  provision_rate: number | null;
  hourly_rate: number | null;
}

export default async function CRMConnectPage() {
  const { supabase, user } = await getCurrentUser();

  // 🔐 SECURITY: Redirect if not authenticated
  if (!user) {
    redirect("/login");
  }

  // 🔐 SECURITY: Check admin status
  let isAdmin = false;
  if (
    user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
    user.email === "etmanagement@gmail.com"
  ) {
    isAdmin = true;
  } else {
    const profile = await getCurrentProfile(user.id);
    if (profile?.role === "admin") {
      isAdmin = true;
    }
  }

  if (!isAdmin) {
    redirect("/");
  }

  // 📊 FETCH DATA
  // Migrate any OnlyFans models that don't have a crm_model_sessions row yet.
  // This used to loop per-model with 2 sequential queries each (up to 2N
  // round-trips on every single page visit); now it's a fixed handful of
  // queries no matter how many models exist.
  try {
    const [{ data: oldModels, error: oldModelsError }, { data: existingSessions }] = await Promise.all([
      supabase.from("models").select("id, name, platform_type").eq("platform_type", "onlyfans"),
      supabase.from("crm_model_sessions").select("model_id"),
    ]);

    if (oldModelsError) {
      console.error("Error fetching old models:", oldModelsError);
    }

    const existingIds = new Set((existingSessions || []).map((s: any) => s.model_id));
    const missing = (oldModels || []).filter((m: any) => !existingIds.has(m.id));

    if (missing.length > 0) {
      const now = new Date().toISOString();
      const { error: insertError } = await supabase.from("crm_model_sessions").insert(
        missing.map((m: any) => ({
          model_id: m.id,
          is_active: false,
          auth_cookies: null,
          last_verified_at: now,
          last_synced_at: null,
          created_at: now,
          updated_at: now,
        }))
      );
      if (insertError) console.error("Error migrating models:", insertError);
    }
  } catch (err) {
    console.error("Migration error:", err);
  }

  // Now fetch from crm_model_sessions (both active and inactive), the
  // chatter list, and the full staff/roles table (moved here from the
  // Management page) in parallel - none of these depend on each other.
  const [{ data: connectedModels, error: fetchError }, { data: chatters }, { data: staffProfiles }] = await Promise.all([
    supabase.from("crm_model_sessions").select("model_id, is_active").order("model_id", { ascending: true }),
    supabase.from("profiles").select("user_id, full_name, role").in("role", ["chatter", "moderator"]).order("full_name", { ascending: true }),
    supabase.from("profiles").select("user_id, role, email, full_name, provision_rate, hourly_rate"),
  ]);

  if (fetchError) {
    console.error("Error fetching models:", fetchError);
  }

  // Type safety - use model_id as both id and name for now
  let typedModels: Model[] = (connectedModels || []).map((m: any) => ({
    id: m.model_id,
    name: m.model_id, // Use model_id as display name (will be updated when connected)
    platform_type: "onlyfans",
  }));

  // 📊 Sidebar only shows currently-active (is_active = true) sessions -
  // derived from the same connectedModels fetch instead of a second query.
  let sidebarModels: any[] = [];

  // FALLBACK: If crm_model_sessions is empty, try old models table
  if (!connectedModels || connectedModels.length === 0) {
    const { data: fallbackModels } = await supabase
      .from("models")
      .select("id, name, platform_type")
      .eq("platform_type", "onlyfans")
      .order("name", { ascending: true });

    if (fallbackModels && fallbackModels.length > 0) {
      typedModels = fallbackModels.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        platform_type: m.platform_type,
      }));
    }
  } else {
    // Lookup names + avatars from models table once, for all connected entries
    const modelIds = connectedModels.map((m: any) => m.model_id);
    const { data: modelDetails } = await supabase
      .from("models")
      .select("id, name, avatar_url")
      .in("id", modelIds);

    const nameMap = new Map(modelDetails?.map((m: any) => [m.id, m.name]) || []);
    const avatarMap = new Map(modelDetails?.map((m: any) => [m.id, m.avatar_url]) || []);

    typedModels = connectedModels.map((m: any) => ({
      id: m.model_id,
      name: nameMap.get(m.model_id) || m.model_id,
      platform_type: "onlyfans",
    }));

    sidebarModels = connectedModels
      .filter((m: any) => m.is_active)
      .map((m: any) => ({
        id: m.model_id,
        name: nameMap.get(m.model_id) || m.model_id,
        avatar_url: avatarMap.get(m.model_id) || null,
      }));
  }

  const typedChatters: Chatter[] = chatters || [];
  const typedStaffProfiles: StaffProfile[] = staffProfiles || [];

  return (
    <CRMConnectClient
      initialModels={typedModels}
      initialChatters={typedChatters}
      connectedModels={sidebarModels}
      staffProfiles={typedStaffProfiles}
      updateMitarbeiterRolle={updateMitarbeiterRolle}
      updateMitarbeiterName={updateMitarbeiterName}
      updateMitarbeiterCompensation={updateMitarbeiterCompensation}
      deleteMitarbeiter={deleteMitarbeiter}
    />
  );
}
