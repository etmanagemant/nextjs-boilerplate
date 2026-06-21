"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const supabase = createClient();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (isRegister) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setErrorMsg(error.message); setLoading(false); return; }
      setSuccessMsg("Erfolgreich! Du kannst dich jetzt einloggen.");
      setIsRegister(false);
      setLoading(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setErrorMsg(error.message); setLoading(false); return; }
      
      // 🟢 Schickt dich direkt und ohne Middleware-Verzögerung auf die Startseite!
      window.location.href = "/";
    }
  }

  return (
    <div className="max-w-md mx-auto pt-20 px-4 text-white">
      <h1 className="text-2xl font-bold mb-6 text-center">{isRegister ? "Registrieren" : "Login"}</h1>
      <form onSubmit={onSubmit} className="space-y-4 bg-slate-900 border border-slate-800 p-6 rounded-lg shadow-md">
        <div>
          <label className="text-sm font-medium block mb-1">E-Mail</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full rounded-md border border-slate-700 p-2 text-slate-900 bg-white" required />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Passwort</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="w-full rounded-md border border-slate-700 p-2 text-slate-900 bg-white" required />
        </div>
        {errorMsg && <div className="text-sm text-red-500 font-medium">{errorMsg}</div>}
        {successMsg && <div className="text-sm text-green-500 font-medium">{successMsg}</div>}
        <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer">
          {loading ? "Bitte warten..." : isRegister ? "Konto erstellen" : "Einloggen"}
        </button>
      </form>
      <div className="mt-6 text-sm text-center">
        <button type="button" onClick={() => { setIsRegister(!isRegister); setErrorMsg(null); setSuccessMsg(null); }} className="text-blue-400 hover:underline font-medium cursor-pointer">
          {isRegister ? "Hier einloggen" : "Jetzt registrieren"}
        </button>
      </div>
    </div>
  );
}
