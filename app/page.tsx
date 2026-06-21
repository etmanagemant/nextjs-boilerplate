// app/page.tsx
import WeeklyCalendar from "@/components/WeeklyCalendar";
import { getCurrentRole } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const role = await getCurrentRole();

  // Sicherheits-Netz: Wer nicht eingeloggt ist, fliegt zum Login
  if (!role) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-6 border-b border-white/10 pb-4">
        <span className="text-sm font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
          Eingeloggt als: {role.toUpperCase()}
        </span>
        {/* Logout-Button, der die Session über ein einfaches Formular löscht */}
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition">
            Abmelden (Logout)
          </button>
        </form>
      </div>

      <WeeklyCalendar />
    </main>
  );
}
