"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  chatter: "Chatter",
  moderator: "Moderator (Stripchat)",
  model: "Model",
};

/**
 * Shown instead of the whole app for a freshly self-registered user whose
 * profiles.role is still null - the admin hasn't assigned a real role via
 * Management yet, so there's nothing they should be able to see. Polls the
 * user's own profile row so this updates on its own once a role lands,
 * without the user needing to guess when to check back.
 */
export default function WaitingForRole({ userId }: { userId: string }) {
  const [role, setRole] = useState<string | null>(null);
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle();
      if (!cancelled && data?.role) setRole(data.role);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/80 p-8 text-center">
        {!role ? (
          <>
            <div className="animate-spin mx-auto mb-4 text-3xl w-fit">⏳</div>
            <h1 className="text-lg font-black uppercase tracking-wider text-[#E2C48A] mb-2">
              Deine Rolle wird dir noch zugewiesen
            </h1>
            <p className="text-sm text-slate-400">Bitte warte einen Moment, das dauert nicht lange.</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 text-3xl w-fit">✅</div>
            <h1 className="text-lg font-black uppercase tracking-wider text-[#E2C48A] mb-2">
              Deine Rolle wurde zugewiesen: {ROLE_LABEL[role] || role}
            </h1>
            <p className="text-sm text-slate-400 mb-5">Lade die Seite neu, um deinen neuen Arbeitsbereich zu sehen.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-gradient-to-b from-[#C9A86A] to-[#9C7A3D] hover:from-[#E5C158] text-black font-bold rounded-lg uppercase tracking-wider text-xs transition shadow-lg"
            >
              🔄 Seite neu laden
            </button>
          </>
        )}

        <form action="/api/logout" method="POST" className="mt-6 pt-5 border-t border-white/10">
          <button
            type="submit"
            className="text-xs font-bold text-slate-500 hover:text-red-400 transition uppercase tracking-wider"
          >
            🚪 Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}
