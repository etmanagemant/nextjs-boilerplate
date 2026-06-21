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

  // 1. Wenn kein User eingeloggt ist -> Login
  if (!user) { redirect("/login"); }

  // 2. Rolle direkt abfragen
  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  const role = profile?.role || "chatter";

  // 3. Wenn kein Admin -> Ab zur Stechuhr
  if (role !== "admin") { redirect("/chatter"); }

  const baseWeekStart = startOfWeekMonday(new Date());
  const days = Array.from({ length: 7 }).map((_, i) => addDays(baseWeekStart, i));
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit" };
  const weekLabel = `${days[0].toLocaleDateString(undefined, opts)} – ${days[6].toLocaleDateString(undefined, opts)}`;

  return (
    <div className="p-6 min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-6 border-b border-white/10 pb-4">
        <span className="text-sm font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
          Eingeloggt als: {role.toUpperCase()} ({user.email})
        </span>
        <div className="flex gap-4">
          <a href="/management" className="text-xs bg-slate-800 text-slate-200 px-3 py-1.5 rounded hover:bg-slate-700">Management</a>
          <form action="/api/logout" method="POST">
            <button type="submit" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition cursor-pointer">
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

      <div className="mt-6 rounded border border-white/10 bg-black/20 p-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-7 gap-3">
          {days.map((d) => {
            const isToday = formatDateISO(d) === formatDateISO(new Date());
            return (
              <div key={formatDateISO(d)} className={`rounded p-3 border ${isToday ? "border-amber-500/50 bg-amber-500/10" : "border-white/10 bg-black/10"}`}>
                <div className="text-xs text-white/70">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="mt-1 text-lg font-semibold text-white">{d.toLocaleDateString(undefined, { day: "2-digit" })}</div>
                <div className="mt-1 text-xs text-white/60">{d.toLocaleDateString(undefined, { month: "short" })}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
