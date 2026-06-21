"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        router.push("/");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
      }

      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Auth fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded border border-white/10 bg-black/30 p-6"
      >
        <h1 className="text-xl font-semibold text-white">
          {mode === "login" ? "Login" : "Registrieren"}
        </h1>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="text-sm text-white/70">E-Mail</div>
            <input
              className="mt-1 w-full rounded bg-white/5 px-3 py-2 text-white outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
            />
          </label>

          <label className="block">
            <div className="text-sm text-white/70">Passwort</div>
            <input
              className="mt-1 w-full rounded bg-white/5 px-3 py-2 text-white outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error && (
            <div className="rounded bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</div>
          )}

          <button
            disabled={loading}
            className="w-full rounded bg-gold.primary px-3 py-2 text-black font-semibold disabled:opacity-60"
            type="submit"
          >
            {loading ? "Bitte warten..." : mode === "login" ? "Einloggen" : "Registrieren"}
          </button>

          <button
            type="button"
            className="w-full rounded bg-white/5 px-3 py-2 text-white font-semibold"
            onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}
          >
            {mode === "login" ? "Account erstellen" : "Schon einen Account? Login"}
          </button>
        </div>
      </form>
    </div>
  );
}