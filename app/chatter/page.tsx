"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
// 🟢 Pfad korrigiert: Kein .ts am Ende, großes C bei supabaseClient, Alias (@) genutzt für Stabilität
import { createClient } from "@/lib/supabaseClient";

type AssignmentRow = {
  id: number;
  shift_id: number;
  chatter_id: string;
  model_id?: number | null;
  started_at: string | null;
  ended_at: string | null;
};

function toDurationHours(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  return diffMs / (1000 * 60 * 60);
}

export default function ChatterPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  
  // 🟢 NEU HINZUGEFÜGT: Speichert die E-Mail des aktuell angemeldeten Chatters
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("chatter_user");

  // 🟢 NEU HINZUGEFÜGT: Holt die E-Mail live aus der Session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setCurrentUserEmail(data.user.email);
      }
    });
  }, [supabase]);

  // Mit useCallback isoliert, um es in useEffect ohne Render-Schleifen zu nutzen
  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("shift_assignments")
      .select("id, shift_id, chatter_id, model_id, started_at, ended_at")
      .order("id", { ascending: false })
      .limit(50);

    if (error) {
      setErr(error.message);
      return;
    }
    setRows((data ?? []) as AssignmentRow[]);
  }, [supabase]);

  // Erstmaliges Laden der Daten
  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("shift_assignments")
        .select("id, shift_id, chatter_id, model_id, started_at, ended_at")
        .order("id", { ascending: false })
        .limit(50);

      if (!isMounted) return;

      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as AssignmentRow[]);
      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const totalHours = useMemo(() => {
    return rows.reduce((sum, r) => sum + toDurationHours(r.started_at, r.ended_at), 0);
  }, [rows]);

  // 🟢 NEU HINZUGEFÜGT: Findet heraus, ob dieser Chatter gerade eine offene Schicht hat
  const activeShift = useMemo(() => {
    return rows.find(r => r.chatter_id === currentUserEmail && r.started_at && !r.ended_at);
  }, [rows, currentUserEmail]);

  // 🟢 NEU HINZUGEFÜGT: Funktion für den neuen globalen Start-Button oben
  async function triggerGlobalStart() {
    setErr(null);
    const { error } = await supabase
      .from("shift_assignments")
      .insert([
        {
          shift_id: 1, 
          chatter_id: currentUserEmail,
          started_at: new Date().toISOString(),
          ended_at: null
        }
      ]);

    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  // 🟢 NEU HINZUGEFÜGT: Funktion für den neuen globalen Ende-Button oben
  async function triggerGlobalEnd() {
    if (!activeShift) {
      setErr("Keine aktive Schicht zum Beenden gefunden.");
      return;
    }
    setErr(null);
    const { error } = await supabase
      .from("shift_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", activeShift.id);

    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  // 🔵 DEINE BESTEHENDE FUNKTION (Vollständig erhalten)
  async function startAssignment(id: number) {
    setErr(null);

    const { data: updated, error } = await supabase
      .from("shift_assignments")
      .update({ started_at: new Date().toISOString(), ended_at: null })
      .eq("id", id)
      .is("started_at", null)
      .select("*")
      .maybeSingle();

    if (error) {
      setErr(error.message);
      return;
    }

    await refresh();
  }

  // 🔵 DEINE BESTEHENDE FUNKTION (Vollständig erhalten)
  async function endAssignment(id: number) {
    setErr(null);

    const { data: updated, error } = await supabase
      .from("shift_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", id)
      .not("started_at", "is", null)
      .is("ended_at", null)
      .select("*")
      .maybeSingle();

    if (error) {
      setErr(error.message);
      return;
    }

    await refresh();
  }

  return (
    <div className="p-6 min-h-screen bg-slate-950 text-white">
      {/* NAVIGATION MIT LOGOUT-BUTTON */}
      <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
        <h1 className="text-xl font-semibold text-white">Chatter — Stechuhr</h1>
        <form action="/api/logout" method="POST">
          <button 
            type="submit" 
            className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded hover:bg-red-500/30 transition font-medium cursor-pointer"
          >
            Abmelden (Logout)
          </button>
        </form>
      </div>

      {/* 🟢 NEU HINZUGEFÜGT: GLOBALER STEMPEL-BEREICH (IMMERSICHTBAR OBEN) */}
      <div className="bg-slate-900 border border-white/10 p-4 rounded-lg mb-6 flex gap-4 items-center flex-wrap">
        <span className="text-sm text-slate-300 font-medium">Deine Stechuhr:</span>
        <button
          onClick={triggerGlobalStart}
          disabled={!!activeShift}
          className="rounded bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-40 font-semibold text-white transition cursor-pointer disabled:cursor-not-allowed"
        >
          Start Schicht
        </button>
        <button
          onClick={triggerGlobalEnd}
          disabled={!activeShift}
          className="rounded bg-red-600 px-4 py-2 text-sm hover:bg-red-700 disabled:opacity-40 font-semibold text-white transition cursor-pointer disabled:cursor-not-allowed"
        >
          Ende Schicht
        </button>
        {activeShift && (
          <span className="text-xs text-emerald-400 font-medium animate-pulse ml-2">
            ● Schicht läuft seit {new Date(activeShift.started_at!).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="mt-2 text-sm text-white/70">
        Gesamtstunden (Summe aller offenen/geschlossenen Sessions):{" "}
        <span className="text-white font-semibold">{totalHours.toFixed(2)} h</span>
      </div>

      {err && (
        <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded">
          Supabase Fehler: {err}
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm text-white/70">Lade…</div>
      ) : (
        <div className="mt-6 space-y-3">
          {/* DEIN BESTEHENDER LIST-MAPPER (Vollständig erhalten) */}
          {rows.map((r) => {
            const started = !!r.started_at;
            const ended = !!r.ended_at;
            const hours = toDurationHours(r.started_at, r.ended_at);

            return (
              <div
                key={r.id}
                className="rounded border border-white/10 p-3 bg-black/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-white/90">
                    Assignment #{r.id} — Chatter: <span className="text-blue-400 font-medium">{r.chatter_id}</span>
                  </div>
                  <div className="text-xs text-white/70">
                    {hours.toFixed(2)} h
                  </div>
                </div>

                <div className="mt-2 text-xs text-white/70 line-height-relaxed">
                  shift_id: {r.shift_id} <br />
                  model_id: {r.model_id ?? "—"} <br />
                  started_at: {r.started_at ? new Date(r.started_at).toLocaleString() : "—"} <br />
                  ended_at: {r.ended_at ? new Date(r.ended_at).toLocaleString() : "—"}
                </div>

                <div className="mt-3 flex gap-3">
                  <button
                    className="rounded bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-50 text-white transition font-medium cursor-pointer"
                    onClick={() => startAssignment(r.id)}
                    disabled={started && !ended}
                  >
                    Start Schicht
                  </button>

                  <button
                    className="rounded bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-50 text-white transition font-medium cursor-pointer"
                    onClick={() => endAssignment(r.id)}
                    disabled={!started || ended}
                  >
                    Ende Schicht
                  </button>
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div className="text-sm text-white/70 py-4">
              Keine shift_assignments gefunden. Klicke oben auf "Start Schicht", um deine erste Session zu erfassen!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
