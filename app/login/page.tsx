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
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { setErrorMsg(error.message); setLoading(false); return; }
      
      // 🟢 Erstelle automatisch ein Profile für den neuen Benutzer
      if (data?.user?.id) {
        const { error: profileError } = await supabase.from("profiles").insert([
          {
            user_id: data.user.id,
            email: email,
            full_name: "",
            role: "chatter",
            provision_rate: 20
          }
        ]);
        if (profileError) {
          console.error("Profile creation error:", profileError);
          // Nicht als Fehler anzeigen - Auth war erfolgreich
        }
      }
      
      setSuccessMsg("Erfolgreich! Du kannst dich jetzt einloggen.");
      setIsRegister(false);
      setLoading(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setErrorMsg(error.message); setLoading(false); return; }
      
      // 🟢 Bleibt absolut flüssig
      window.location.href = "/";
    }
  }
  return (
    <div className="max-w-md mx-auto pt-28 px-4 text-[#F3E5AB]">
      {/* Überschrift im edlen Marken-Look */}
      <h1 className="text-3xl font-black mb-6 text-center tracking-wider bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase">
        {isRegister ? "Registrieren" : "Login"}
      </h1>
      
      <form onSubmit={onSubmit} className="space-y-4 bg-[#0A0A0A] border border-[#AA7C11]/30 p-6 rounded-xl shadow-2xl shadow-black/80">
        <div>
          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-1">E-Mail Adresse</label>
          <input 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            type="email" 
            className="w-full rounded-md border border-[#AA7C11]/30 p-2 text-white bg-[#050505] focus:border-[#D4AF37] outline-none text-sm transition-all" 
            required 
          />
        </div>
        <div>
          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-1">Passwort</label>
          <input 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            type="password" 
            className="w-full rounded-md border border-[#AA7C11]/30 p-2 text-white bg-[#050505] focus:border-[#D4AF37] outline-none text-sm transition-all" 
            required 
          />
        </div>

        {errorMsg && <div className="text-sm text-red-400 font-semibold bg-red-500/10 border border-red-500/20 p-2 rounded text-center">{errorMsg}</div>}
        {successMsg && <div className="text-sm text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 p-2 rounded text-center">{successMsg}</div>}

        <button 
          type="submit" 
          disabled={loading} 
          className="w-full rounded-lg bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#C59B27] px-4 py-2 text-sm font-bold text-black shadow-md shadow-amber-950/20 transition-all cursor-pointer disabled:opacity-40"
        >
          {loading ? "Bitte warten..." : isRegister ? "Konto erstellen" : "Einloggen"}
        </button>
      </form>

      <div className="mt-6 text-sm text-center">
        <button 
          type="button" 
          onClick={() => { setIsRegister(!isRegister); setErrorMsg(null); setSuccessMsg(null); }} 
          className="text-[#D4AF37] hover:text-[#E5C158] transition font-semibold cursor-pointer outline-none"
        >
          {isRegister ? "Bereits ein Konto? Hier einloggen" : "Noch kein Zugang? Jetzt registrieren"}
        </button>
      </div>
    </div>
  );
}
