import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CRMVaultClient from "@/components/layout/CRMVaultClient";

export const dynamic = "force-dynamic";

interface Script {
  id: string;
  title: string;
  script_content: string;
  category: "greeting" | "offer" | "follow_up" | "custom";
  is_global: boolean;
  assigned_to_user: string | null;
  created_at: string;
}

interface Chatter {
  user_id: string;
  full_name: string;
  role: string;
}

export default async function CRMVaultPage() {
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

  // 📚 FETCH SCRIPTS DATA
  const { data: scripts } = await supabase
    .from("crm_script_library")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: chatters } = await supabase
    .from("profiles")
    .select("user_id, full_name, role")
    .in("role", ["chatter", "moderator"])
    .order("full_name", { ascending: true });

  // Type safety
  const typedScripts: Script[] = scripts || [];
  const typedChatters: Chatter[] = chatters || [];

  return (
    <CRMVaultClient
      initialScripts={typedScripts}
      initialChatters={typedChatters}
    />
  );
}
