import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { redirect } from "next/navigation";
import ModelOnlyFansStatsClient from "@/components/layout/ModelOnlyFansStatsClient";

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

  return <ModelOnlyFansStatsClient />;
}
