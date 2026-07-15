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

  // 🔐 SECURITY: Check if user is a chatter (can only access their own inbox)
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "chatter" && profile.role !== "moderator")) {
    redirect("/");
  }

  // 📊 FETCH INITIAL DATA
  try {
    const fans = await fetchActiveFans(user.id);
    const scripts = await fetchScriptLibrary(user.id);

    return (
      <CRMInboxClient
        chatterId={user.id}
        initialFans={fans || []}
        initialScripts={scripts || []}
      />
    );
  } catch (err) {
    console.error("Error loading CRM Inbox:", err);
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0A0A]">
        <div className="text-center text-[#F3E5AB]">
          <h1 className="text-2xl font-bold mb-2">⚠️ Error Loading Inbox</h1>
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
