import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/getCurrentUser";
import ComingSoon from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function StripchatPage() {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <ComingSoon
      icon="🎬"
      title="Stripchat"
      subtitle="Die Stripchat-Integration ist in Arbeit und folgt nach demselben Prinzip wie die OnlyFans-Anbindung."
    />
  );
}
