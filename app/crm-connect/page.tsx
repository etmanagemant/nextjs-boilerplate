import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import WorkspaceSidebar from "@/components/layout/WorkspaceSidebar";
import CRMConnectClient from "@/components/layout/CRMConnectClient";

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

export default async function CRMConnectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get connected models
  const { data: connectedModels } = await supabase
    .from("crm_model_sessions")
    .select("model_id")
    .eq("is_active", true);

  const modelIds = connectedModels?.map((m: any) => m.model_id) || [];

  // Fetch models
  const { data: models } = await supabase
    .from("models")
    .select("id, name, platform_type")
    .order("name", { ascending: true });

  // Fetch chatters
  const { data: chatters } = await supabase
    .from("profiles")
    .select("user_id, full_name, role")
    .in("role", ["chatter", "moderator"])
    .order("full_name", { ascending: true });

  const typedModels: Model[] = models || [];
  const typedChatters: Chatter[] = chatters || [];

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-[#F3E5AB]">
      <WorkspaceSidebar
        connectedModelIds={modelIds}
        currentHub="connection"
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <CRMConnectClient
          initialModels={typedModels}
          initialChatters={typedChatters}
        />
      </main>
    </div>
  );
}
