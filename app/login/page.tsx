"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isRegister, setIsRegister] = useState(false); // Schaltet zwischen Login und Registrierung um
  const [redirectTo, setRedirectTo] = useState("/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const nextParam = new URLSearchParams(window.location.search).get("next");
    setRedirectTo(nextParam ?? "/");
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (isRegister) {
      // 🟢 REGISTRIERUNG
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      setSuccessMsg("Registrierung erfolgreich! Du kannst dich jetzt einloggen.");
      setIsRegister(false);
      setLoading(false);
    } else {
      // 🔵 LOGIN
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      router.refresh(); 
      router.replace(redirectTo);
    }
  }

  return (
    <div className="max-w-md mx-auto pt-10 px-4">
      <h1 className="text-2xl font-bold mb-6">
        {isRegister ? "Registrieren (Neuer Mitarbeiter)" : "Login"}
      </h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">E-Mail</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            className="w-full rounded-md border p-2 text-slate-900 bg-white"
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
            className="w-full rounded-md border p-2 text-slate-900 bg-white"
            required
          />
        </div>

        {errorMsg && <div className="text-sm text-red-500 font-medium">{errorMsg}</div>}
        {successMsg && <div className="text-sm text-green-600 font-medium">{successMsg}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition"
        >
          {loading ? "Bitte warten..." : isRegister ? "Konto erstellen" : "Einloggen"}
        </button>
      </form>

      <div className="mt-6 text-sm text-center">
        <button
          type="button"
          onClick={() => {
            setIsRegister(!isRegister);
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className="text-blue-600 hover:underline font-medium"
        >
          {isRegister ? "Bereits registriert? Hier einloggen" : "Neu hier? Jetzt als Mitarbeiter registrieren"}
        </button>
      </div>
    </div>
  );
}
