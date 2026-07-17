import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { ModelTabs } from "@/components/ModelTabs";

export const dynamic = "force-dynamic";

export default async function CRMLivePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all active models this user has access to
  const { data: sessions, error } = await supabase
    .from("crm_model_sessions")
    .select("model_id, is_active")
    .eq("is_active", true)
    .order("model_id", { ascending: true });

  if (error) {
    console.error("Error fetching models:", error);
    return (
      <div className="p-4 text-red-500">
        Error loading models: {error.message}
      </div>
    );
  }

  // Fetch model names
  const modelIds = sessions?.map((s) => s.model_id) || [];
  const { data: models } = await supabase
    .from("models")
    .select("id, name")
    .in("id", modelIds);

  const availableModels = (models || []).map((m) => ({
    id: m.id,
    name: m.name,
  }));

  if (availableModels.length === 0) {
    return (
      <div className="p-4 text-yellow-500">
        <p>No active models connected.</p>
        <p className="text-sm">
          Go to Management → Connection Hub to connect models.
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-gray-900">
      <ModelTabs availableModels={availableModels} />
    </div>
  );
}
