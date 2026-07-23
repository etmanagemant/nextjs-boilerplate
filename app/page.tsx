import { redirect } from "next/navigation";
import WeeklyCalendar from "@/components/layout/WeeklyCalender";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";

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

  // 2-4. Schichten, Models und alle Profile unabhängig voneinander laden
  const [{ data: shifts }, { data: models }, { data: profiles }] = await Promise.all([
    supabase.from("shifts").select("*"),
    supabase.from("models").select("id, name").order("name", { ascending: true }),
    supabase.from("profiles").select("user_id, role, full_name"),
  ]);
  const profileMap = new Map((profiles || []).map(p => [p.user_id, p.role || "chatter"]));

  return (
    <main className="min-h-screen bg-slate-950 p-4">
      <WeeklyCalendar 
        sichereShifts={shifts || []} 
        modelsListe={models || []} 
        role={role} 
        userEmail={user.email || ""} 
        userId={user.id}
        profileMap={profileMap}
      />
    </main>
  );
}
