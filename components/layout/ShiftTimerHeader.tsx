"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Same live-ticking timer as app/chatter/page.tsx's own LiveTimer - kept
// separate on purpose (this one polls for whether a shift exists at all,
// that one already has it as a prop) rather than sharing one component.
function useElapsed(startedAt: string) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const calc = () => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  return seconds;
}

const POLL_INTERVAL_MS = 30000;

/**
 * Gold "you're on shift" timer shown centered in the header - only appears
 * while chatter_id has a shift_assignments row with started_at set and
 * ended_at still null (i.e. currently clocked in via the Stechuhr page,
 * app/chatter/page.tsx). Deliberately role-agnostic: any logged-in user
 * (chatter, moderator, admin, content-manager) can clock in there, so this
 * just checks "does THIS user have an active row" rather than gating on a
 * specific role.
 */
export default function ShiftTimerHeader({ userId }: { userId?: string }) {
  const [startedAt, setStartedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase
        .from("shift_assignments")
        .select("started_at")
        .eq("chatter_id", userId)
        .is("ended_at", null)
        .not("started_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setStartedAt(data?.started_at || null);
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  if (!startedAt) return null;
  return <ShiftTimerBadge startedAt={startedAt} />;
}

function ShiftTimerBadge({ startedAt }: { startedAt: string }) {
  const seconds = useElapsed(startedAt);
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return (
    <div className="flex flex-col items-center leading-none flex-shrink-0">
      <span className="font-mono font-black text-lg bg-gradient-to-r from-[#E5C158] to-[#C9A86A] bg-clip-text text-transparent tracking-wider">
        {pad2(hrs)}:{pad2(mins)}:{pad2(secs)}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#9C7A3D] mt-0.5">
        Every second counts
      </span>
    </div>
  );
}
