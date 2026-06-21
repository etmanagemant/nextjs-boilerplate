// app/page.tsx
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

function pad2(n: number) { return String(n).padStart(2, "0"); }
function formatDateISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfWeekMonday(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay(); const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday); return d;
}
function addDays(date: Date, days: number) {
  const d = new Date(date); d.setDate(d.getDate() + days); return d;
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) { redirect("/login"); }

  // Deine Admin-Berechtigung
  let role = "chatter";
  if (user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" || user.email?.includes("tobias")) {
    role = "admin";
  } else {
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    role = profile?.role || "chatter";
  }

  if (role !== "admin") { redirect("/chatter"); }

  // 🟢 LIVE-DATEN: Holt alle geplanten Schichten und verknüpft sie mit den Models
  const { data: geplanteShifts } = await supabase.from("shifts").select("*, models(name)");
  const sichereShifts = geplanteShifts || [];

  const baseWeekStart = startOfWeekMonday(new Date());
  const days = Array.from({ length: 7 }).map((_, i) => addDays(baseWeekStart, i));
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit" };
  const weekLabel = `${days[0].toLocaleDateString(undefined, opts)} – ${days[6].toLocaleDateString(undefined, opts)}`;

  return (
    <div className="p-6 min-h-screen bg-slate-950 text-white">
      {/* HEADER BAR */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-6 border-b border-white/10 pb-4">
        <span className="text-sm font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
          Eingeloggt als: {role.toUpperCase()} ({user.email})
        </span>
        <div className="flex gap-4">
          <a href="/management" className="text-xs bg-slate-800 text-slate-200 px-3 py-1.5 rounded hover:bg-slate-700">Management</a>
          <form action="/api/logout" method="POST">
            <button type="submit" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition">
              Abmelden
            </button>
          </form>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-white">Weekly Calendar</h1>
          <div className="mt-1 text-sm text-white/70">{weekLabel}</div>
        </div>
      </div>

      {/* KALENDER GRID */}
      <div className="mt-6 rounded border border-white/10 bg-black/20 p-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-7 gap-3">
          {days.map((d) => {
            const dateKey = formatDateISO(d);
            const isToday = dateKey === formatDateISO(new Date());

            // 🟢 FILTERT DIE GEPLANTEN SCHICHTEN FÜR GENAU DIESEN TAG HERAUS
            const schichtenAnDiesemTag = sichereShifts.filter(s => s.date === dateKey);

            return (
              <div key={dateKey} className={`rounded p-3 border min-h-[300px] ${isToday ? "border-amber-500/50 bg-amber-500/10" : "border-white/10 bg-black/10"}`}>
                <div className="text-xs text-white/70">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="mt-1 text-lg font-semibold text-white">{d.toLocaleDateString(undefined, { day: "2-digit" })}</div>
                <div className="mt-1 text-xs text-white/60 mb-3">{d.toLocaleDateString(undefined, { month: "short" })}</div>

                {/* 🟢 DIESE SCHLEIFE RENDERT JEDE GEPLANTE SCHICHT LIVE IN DEN KALENDER */}
                <div className="space-y-2 mt-2">
                  {schichtenAnDiesemTag.map((schicht) => (
                    <div key={schicht.id} className="rounded bg-blue-600/20 border border-blue-500/30 p-2 text-left">
                      <div className="text-[11px] font-bold text-blue-400 truncate">
                        👤 {schicht.chatter_id.split("@")[0]}
                      </div>
                      <div className="text-[10px] text-slate-300 mt-0.5">
                        ⏰ {schicht.time_slot}
                      </div>
                      {schicht.models?.name && (
                        <div className="text-[10px] text-emerald-400 mt-0.5 font-medium truncate">
                          💃 Model: {schicht.models.name}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {schichtenAnDiesemTag.length === 0 && (
                    <div className="text-[10px] text-slate-600 italic text-center pt-8">Keine Schichten</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
