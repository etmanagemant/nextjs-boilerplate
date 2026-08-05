import { redirect } from "next/navigation";
import WeeklyCalendar from "@/components/layout/WeeklyCalender";
import CreateShiftForm from "@/components/layout/CreateShiftForm";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { isAdminTierRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Rolle des Benutzers ermitteln
  let role = "mitarbeiter";
  if (user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com") {
    role = "admin";
  } else {
    const profile = await getCurrentProfile(user.id);
    if (profile && profile.role === "admin") {
      role = "admin";
    } else if (profile && profile.role) {
      role = profile.role;
    }
  }

  // Models haben keinen Schichtplan/Kalender - ihr einziger Bereich ist
  // das eigene Upload-Workspace.
  if (role === "model") {
    redirect("/model-workspace");
  }

  // 2-4. Schichten, Models und alle Profile unabhängig voneinander laden
  const [{ data: shifts }, { data: models }, { data: profiles }] = await Promise.all([
    supabase.from("shifts").select("*"),
    supabase.from("models").select("id, name, platform_type").order("name", { ascending: true }),
    supabase.from("profiles").select("user_id, role, full_name, email"),
  ]);
  const profileMap = new Map((profiles || []).map(p => [p.user_id, p.role || "chatter"]));

  return (
    <main className="min-h-screen bg-[#0A0A0A] p-4">
      <WeeklyCalendar
        sichereShifts={shifts || []}
        modelsListe={models || []}
        role={role}
        userEmail={user.email || ""}
        userId={user.id}
        profileMap={profileMap}
      />
      {/* Schichtplanung-Formular - vom Management-Control-Panel hierher
          verschoben, direkt unter den Kalender, den es befüllt. Wie schon
          auf der alten Seite: gleiche Rechte wie Admin, aber weiterhin
          nicht für Chatter/Moderator sichtbar. */}
      {isAdminTierRole(role) && (
        <section className="w-[98%] mx-auto mt-6 bg-white/[0.03] backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl shadow-black/20">
          <h2 className="text-sm font-bold mb-4 text-[#C9A86A] uppercase tracking-wider">Neue Schicht zuteilen & planen</h2>
          <CreateShiftForm sichereProfile={profiles || []} sichereModels={models || []} />
        </section>
      )}
    </main>
  );
}
