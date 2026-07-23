import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/getCurrentUser";
import ComingSoon from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <ComingSoon
      icon="🤖"
      title="Assistent"
      subtitle="Dein kleiner KI-Helfer für die Webapp ist in Planung."
    />
  );
}
