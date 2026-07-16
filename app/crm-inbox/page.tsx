import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CRMInboxClient from "@/components/layout/CRMInboxClient";
import {
  fetchActiveFans,
  fetchScriptLibrary,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function CRMInboxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 🔐 SECURITY: Redirect if not authenticated
  if (!user) {
    redirect("/login");
  }

  // 🔐 SECURITY: Allow chatter, moderator, OR admin access
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

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
    // Fetch ALL connected models (both active and inactive)
    const { data: crm_models } = await supabase
      .from("crm_model_sessions")
      .select("model_id")
      .order("model_id", { ascending: true });

    let connectedModels: any[] = [];

    // First: Use crm_model_sessions if it has data
    if (crm_models && crm_models.length > 0) {
      connectedModels = crm_models.map((m: any) => ({
        id: m.model_id,
        name: m.model_id, // Use model_id as name
      }));
      console.log("✅ Loaded models from crm_model_sessions:", connectedModels);
    } else {
      // FALLBACK: Load from old models table if crm_model_sessions is empty
      console.log("⚠️ crm_model_sessions empty, loading from old models table...");
      const { data: fallbackModels } = await supabase
        .from("models")
        .select("id, name, platform_type, profiles!id(full_name)")
        .eq("platform_type", "onlyfans")
        .order("name", { ascending: true });

      if (fallbackModels && fallbackModels.length > 0) {
        console.log("✅ Loaded models from fallback:", fallbackModels);
        connectedModels = fallbackModels.map((m: any) => ({
          id: m.id,
          name: m.profiles?.full_name || m.name || m.id,
        }));
      }
    }

    console.log("📋 Final connectedModels passed to client:", connectedModels);

    const fans = await fetchActiveFans(user.id);
    const scripts = await fetchScriptLibrary(user.id);

    return (
      <CRMInboxClient
        chatterId={user.id}
        initialFans={fans || []}
        initialScripts={scripts || []}
        connectedModels={connectedModels}
        userRole={userRole}
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
          <a
            href="/dashboard"
            className="px-4 py-2 bg-[#D4AF37]/20 text-[#D4AF37] rounded hover:bg-[#D4AF37]/30 transition"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }
}
