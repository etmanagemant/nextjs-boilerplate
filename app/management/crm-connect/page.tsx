import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.role === "admin") {
      isAdmin = true;
    }
  }

  if (!isAdmin) {
    redirect("/");
  }

  // 📊 FETCH DATA
  const { data: models } = await supabase
    .from("models")
    .select("id, name, platform_type")
    .order("name", { ascending: true });

  const { data: chatters } = await supabase
    .from("profiles")
    .select("user_id, full_name, role")
    .in("role", ["chatter", "moderator"])
    .order("full_name", { ascending: true });

  // Type safety
  const typedModels: Model[] = models || [];
  const typedChatters: Chatter[] = chatters || [];

  return (
    <CRMConnectClient
      initialModels={typedModels}
      initialChatters={typedChatters}
    />
  );
}
