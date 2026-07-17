import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import WeeklyCalendar from "@/components/layout/WeeklyCalender";
import NextShiftsWidget from "@/components/layout/NextShiftsWidget";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Rolle des Benutzers ermitteln
  let role = "mitarbeiter";
  if (user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email === "etmanagement@gmail.com") {
    role = "admin";
  } else {
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (profile && profile.role === "admin") {
      role = "admin";
    } else if (profile && profile.role) {
      role = profile.role;
    }
  }

  // 2. Schichten abrufen
  const { data: shifts } = await supabase.from("shifts").select("*");
  
  // 3. Echte Models live aus der Tabelle laden!
  const { data: models } = await supabase.from("models").select("id, name").order("name", { ascending: true });

  // 4. 🔑 NEUE ERGÄNZUNG: Profile laden für Rollen-Mapping
  const { data: profiles } = await supabase.from("profiles").select("user_id, role, full_name");
  const profileMap = new Map((profiles || []).map(p => [p.user_id, p.role || "chatter"]));

  return (
    <main className="min-h-screen bg-slate-950 p-4">
      <NextShiftsWidget 
        allShifts={shifts || []}
        userEmail={user.email || ""}
        userId={user.id}
        userFullName={(() => {
          const profile = (profiles || []).find(p => p.user_id === user.id);
          return profile ? profile.full_name : undefined;
        })()}
      />
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
