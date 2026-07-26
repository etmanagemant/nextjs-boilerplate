import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import ComingSoon from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function ModelOnlyFansStatsPage() {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const profile = await getCurrentProfile(user.id);
  if (profile?.role !== "model") {
    redirect("/");
  }

  return (
    <ComingSoon
      icon="📊"
      title="OnlyFans Statistik"
      subtitle="Deine echten OnlyFans-Zahlen direkt hier einsehen - ist in Arbeit."
    />
  );
}
