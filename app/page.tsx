import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import WeeklyCalendar from "@/components/layout/WeeklyCalender";

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
    }
  }

  // 2. Schichten abrufen
  const { data: shifts } = await supabase.from("shifts").select("*");
  
  // 3. Echte Models live aus der Tabelle laden!
  const { data: models } = await supabase.from("models").select("id, name").order("name", { ascending: true });

  return (
    <main className="min-h-screen bg-slate-950 p-4">
      <WeeklyCalendar 
        sichereShifts={shifts || []} 
        modelsListe={models || []} 
        role={role} 
        userEmail={user.email || ""} 
        userId={user.id} 
      />
    </main>
  );
}
