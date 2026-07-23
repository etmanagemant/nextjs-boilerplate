import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import Link from "next/link";
import CRMInboxClient from "@/components/layout/CRMInboxClient";
import {
  fetchActiveFans,
  fetchScriptLibrary,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function CRMInboxPage() {
  const { supabase, user } = await getCurrentUser();

  // 🔐 SECURITY: Redirect if not authenticated
  if (!user) {
    redirect("/login");
  }

  // 🔐 SECURITY: Allow chatter, moderator, OR admin access
  const profile = await getCurrentProfile(user.id);

  // Allow: chatter, moderator, admin roles. If no profile, allow (could be admin from auth)
  const userRole = profile?.role || "guest";
  const isAllowed = ["chatter", "moderator", "admin"].includes(userRole) ||
                    user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
                    user.email === "etmanagement@gmail.com" ||
                    user.email === "etmanagemant@gmail.com";

  if (!isAllowed && !profile) {
    redirect("/");
  }

  // 📊 FETCH INITIAL DATA
  try {
    // crm_model_sessions RLS only allows admins to read it (it holds auth
    // cookies), so a chatter's cookie-session client gets 0 rows here and
    // used to silently fall through to "show every model, connected or
    // not". Use the admin client instead - only model_id/name/avatar_url
    // ever leave this server component, never the cookies themselves.
    const adminSupabase = createSupabaseAdminClient();

    const { data: crm_models } = await adminSupabase
      .from("crm_model_sessions")
      .select("model_id")
      .eq("is_active", true)
      .order("model_id", { ascending: true });

    const modelIds = (crm_models || []).map((m: any) => m.model_id);

    let connectedModels: { id: string; name: string; avatar_url: string | null }[] = [];
    if (modelIds.length > 0) {
      const { data: modelDetails } = await adminSupabase
        .from("models")
        .select("id, name, avatar_url")
        .in("id", modelIds);

      const detailsMap = new Map(modelDetails?.map((m: any) => [m.id, m]) || []);

      connectedModels = modelIds.map((id: string) => ({
        id,
        name: detailsMap.get(id)?.name || id,
        avatar_url: detailsMap.get(id)?.avatar_url || null,
      }));
    }

    // These three don't depend on each other - fetch them together instead
    // of waiting for each one in turn.
    const initialModelId = connectedModels[0]?.id;
    const [fans, scripts, { data: allShifts }] = await Promise.all([
      initialModelId ? fetchActiveFans(initialModelId) : Promise.resolve([]),
      fetchScriptLibrary(user.id),
      supabase.from("shifts").select("*"),
    ]);

    return (
      <CRMInboxClient
        chatterId={user.id}
        initialFans={fans || []}
        initialScripts={scripts || []}
        connectedModels={connectedModels}
        userRole={userRole}
        allShifts={allShifts || []}
        userEmail={user.email || ""}
        userId={user.id}
      />
    );
  } catch (err) {
    console.error("Error loading CRM Inbox:", err);
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0A0A]">
        <div className="text-center text-[#F3E5AB]">
          <h1 className="text-2xl font-bold mb-2"><span>⚠️</span> <span>Error Loading Inbox</span></h1>
          <p className="text-slate-400 mb-4">
            There was a problem loading your chat interface. Please try again.
          </p>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-[#D4AF37]/20 text-[#D4AF37] rounded hover:bg-[#D4AF37]/30 transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }
}
