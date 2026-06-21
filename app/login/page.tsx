"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

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

    // Login ausführen (Der Browser-Client setzt das Token, die Middleware wandelt es in ein Cookie um)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    // Nach erfolgreichem Login weiterleiten
    router.refresh(); // WICHTIG: Erzwingt, dass Next.js die Server-Komponenten mit den neuen Cookies lädt!
    router.replace(redirectTo);
  }

  return (
    <div className="max-w-md mx-auto pt-10 px-4">
      <h1 className="text-2xl font-bold mb-6">Login</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">E-Mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            className="w-full rounded-md border p-2"
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
            className="w-full rounded-md border p-2"
            required
          />
        </div>

        {errorMsg && <div className="text-sm text-red-500">{errorMsg}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Bitte warten..." : "Einloggen"}
        </button>
      </form>

      <div className="mt-6 text-sm text-gray-500">
        Wenn du neu bist: Mitarbeiter werden über das Dashboard freigeschaltet.
      </div>
    </div>
  );
}
