import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import WorkspaceSidebar from "@/components/layout/WorkspaceSidebar";

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
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const userRole = profile?.role || "guest";
  // Get connected models
  const { data: connectedModels } = await supabase
    .from("crm_model_sessions")
    .select("model_id")
    .eq("is_active", true);

  const modelIds = connectedModels?.map((m: any) => m.model_id) || [];

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#F3E5AB]">
      <WorkspaceSidebar
        connectedModelIds={modelIds}
        currentHub="upload"
        userRole={userRole}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-[#0A0A0A] to-black">
          <div className="text-center">
            <div className="text-6xl mb-4">📤</div>
            <h1 className="text-4xl font-black mb-3 uppercase tracking-wider">
              <span className="bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent">Upload Vault</span>
            </h1>
            <p className="text-slate-400 mb-6">
              Manage your content library & media
            </p>

            <div className="flex gap-4 justify-center">
              <button className="px-6 py-3 bg-[#D4AF37] text-black font-bold rounded-lg hover:bg-[#E5C158] transition">
                ⬆️ Upload File
              </button>
              <button className="px-6 py-3 bg-[#D4AF37]/20 text-[#D4AF37] font-bold rounded-lg hover:bg-[#D4AF37]/30 transition">
                📂 Browse
              </button>
            </div>

            <div className="mt-12 text-sm text-slate-500 max-w-md">
              <p>Coming soon...</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
