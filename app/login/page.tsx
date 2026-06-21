// app/login/page.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [redirectTo, setRedirectTo] = useState("/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const nextParam = new URLSearchParams(window.location.search).get("next");
    setRedirectTo(nextParam ?? "/");
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    // Nach erfolgreichem Login rollenwirksam auf Zielroute
    router.replace(redirectTo);
    setLoading(false);
  }

  return (
    <div className="max-w-md mx-auto pt-10">
      <h1 className="text-2xl font-bold mb-6">Login</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">E-Mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            className="w-full rounded-md border border-line-subtle bg-bg-base px-3 py-2"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Passwort</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border border-line-subtle bg-bg-base px-3 py-2"
            required
          />
        </div>

        {errorMsg ? (
          <div className="text-sm text-red-400">{errorMsg}</div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-goldBg px-4 py-2 text-sm font-semibold text-bg-base shadow-goldSoft transition hover:bg-brand-goldBgDeep disabled:opacity-60"
        >
          {loading ? "Bitte warten..." : "Einloggen"}
        </button>
      </form>

      <div className="mt-6 text-sm text-text-primary/80">
        Wenn du neu bist: Supabase User werden in der DB/Im Dashboard erstellt.
      </div>
    </div>
  );
}