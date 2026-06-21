"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("shift_assignments")
        .select("id, shift_id, chatter_id, model_id, started_at, ended_at")
        .order("id", { ascending: false })
        .limit(50);

      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as AssignmentRow[]);
      setLoading(false);
    })();
  }, []);

  const totalHours = useMemo(() => {
    return rows.reduce((sum, r) => sum + toDurationHours(r.started_at, r.ended_at), 0);
  }, [rows]);

  async function startAssignment(id: number) {
    setErr(null);

    // Nur setzen, wenn started_at noch null ist
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

    // Wenn nichts upgedatet wurde, war started_at schon gesetzt
    // Dann einfach nur neu laden
    if (!updated) {
      await refresh();
      return;
    }

    await refresh();
  }

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

    if (!updated) {
      await refresh();
      return;
    }

    await refresh();
  }

  async function refresh() {
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
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Chatter — Stechuhr</h1>

      <div className="mt-2 text-sm text-white/70">
        Gesamtstunden (Summe aller offenen/geschlossenen Sessions):{" "}
        <span className="text-white">{totalHours.toFixed(2)} h</span>
      </div>

      {err && (
        <div className="mt-3 text-sm text-red-400">
          Supabase Fehler: {err}
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm text-white/70">Lade…</div>
      ) : (
        <div className="mt-6 space-y-3">
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
                    Assignment #{r.id} — Chatter: {r.chatter_id}
                  </div>
                  <div className="text-xs text-white/70">
                    {hours.toFixed(2)} h
                  </div>
                </div>

                <div className="mt-2 text-xs text-white/70">
                  shift_id: {r.shift_id} <br />
                  model_id: {r.model_id ?? "—"} <br />
                  started_at: {r.started_at ?? "—"} <br />
                  ended_at: {r.ended_at ?? "—"}
                </div>

                <div className="mt-3 flex gap-3">
                  <button
                    className="rounded bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
                    onClick={() => startAssignment(r.id)}
                    disabled={started && !ended}
                  >
                    Start Schicht
                  </button>

                  <button
                    className="rounded bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
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
            <div className="text-sm text-white/70">
              Keine shift_assignments gefunden.
            </div>
          )}
        </div>
      )}
    </div>
  );
}