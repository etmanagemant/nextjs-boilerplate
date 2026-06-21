// app/page.tsx
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import WeeklyCalendar from "@/components/layout/WeeklyCalender";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }

  let role = "chatter";
  if (user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email?.includes("tobias")) {
    role = "admin";
  } else {
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    role = profile?.role || "chatter";
  }

  // 🟢 Lädt die Daten aus deiner Tabelle 'shifts'
  const { data: shiftsData } = await supabase.from("shifts").select("*");
  const sichereShifts = shiftsData || [];

  return (
    <div className="p-6 min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-6 border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
            Status: {role.toUpperCase()} ({user.email})
          </span>
          <nav className="flex gap-2">
            {role === "admin" && (
              <a href="/management" className="text-xs bg-slate-800 text-slate-200 px-3 py-1.5 rounded hover:bg-slate-700 transition font-medium">Management</a>
            )}
            <a href="/chatter" className="text-xs bg-slate-800 text-slate-200 px-3 py-1.5 rounded hover:bg-slate-700 transition font-medium">Meine Stechuhr</a>
          </nav>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition">
            Abmelden
          </button>
        </form>
      </div>

      <WeeklyCalendar sichereShifts={sichereShifts} role={role} userEmail={user.email || null} userId={user.id} />
    </div>
  );
}
