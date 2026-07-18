"use client";

import React, { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

interface ManualSessionInjectorComponentProps {
  modelId: string;
  modelName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualSessionInjectorComponent({
  modelId,
  modelName,
  onClose,
  onSuccess,
}: ManualSessionInjectorComponentProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [sessionInput, setSessionInput] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Parse session string and save to Supabase
  const handleSaveSession = async () => {
    if (!sessionInput.trim()) {
      setError("❌ Bitte gib die Session-Cookies ein!");
      return;
    }

    setStatus("loading");
    setMessage("💾 Speichere Session in Datenbank...");
    setError("");

    try {
      const supabase = createClient();
      
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Nicht authentifiziert!");
      }

      // Parse the input - expect format like "auth_id=xxx; sess=yyy"
      const cookies: Record<string, string> = {};
      const pairs = sessionInput.split(/[;,]+/);
      
      for (const pair of pairs) {
        const [key, value] = pair.split("=").map(s => s.trim());
        if (key && value) {
          cookies[key] = value;
        }
      }

      if (!cookies.sess && !cookies.auth_id) {
        throw new Error("❌ Session-Format ungültig! Erwartet: 'auth_id=xxx; sess=yyy'");
      }

      // Validate we have at least sess cookie
      if (!cookies.sess) {
        throw new Error("❌ 'sess' Cookie nicht gefunden!");
      }

      // Upsert into crm_model_sessions
      const { error: upsertError } = await supabase
        .from("crm_model_sessions")
        .upsert(
          {
            model_id: modelId,
            is_active: true,
            auth_cookies: cookies, // Store as JSON object
            last_verified_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "model_id" }
        );

      if (upsertError) {
        throw new Error(`Datenbank-Fehler: ${upsertError.message}`);
      }

      setStatus("success");
      setMessage(`🟢 Model ${modelName} erfolgreich autorisiert! Die Live-Inbox ist jetzt scharfgeschaltet.`);

      // Close modal after success
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setStatus("error");
      setError(err.message || "Fehler beim Speichern der Session!");
      console.error("❌ Error:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] border border-[#D4AF37]/30 rounded-lg shadow-2xl max-w-2xl w-full p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-[#D4AF37]">🔑 Session-Injektor</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-[#D4AF37] transition"
          >
            ✕
          </button>
        </div>

        <div className="mb-6 p-4 bg-black/40 rounded-lg border border-[#D4AF37]/20">
          <p className="text-gray-300">
            <span className="font-bold text-[#D4AF37]">Creator:</span> {modelName}
          </p>
        </div>

        <div className="mb-6">
          {status === "idle" && (
            <div>
              <p className="text-gray-300 mb-4">
                Gib die OnlyFans Session-Cookies ein. Format:
              </p>
              <div className="bg-black/60 p-3 rounded-lg border border-[#AA7C11]/30 mb-4 text-xs text-slate-300">
                <code>auth_id=ABC123xyz; sess=DEF456uvw</code>
              </div>

              <label className="block text-sm font-semibold text-[#D4AF37] mb-2">
                OnlyFans Session-Key (auth_id + sess)
              </label>
              <textarea
                value={sessionInput}
                onChange={(e) => setSessionInput(e.target.value)}
                placeholder="auth_id=...; sess=..."
                className="w-full h-32 p-4 bg-black/60 border border-[#D4AF37]/30 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#D4AF37]/60 focus:ring-1 focus:ring-[#D4AF37]/30 font-mono text-sm resize-none"
              />

              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-200">
                  <span className="font-bold">💡 Wie:</span> Öffne DevTools (F12) → Anwendung → Cookies → onlyfans.com. 
                  Kopiere die Werte von 'auth_id' und 'sess'.
                </p>
              </div>
            </div>
          )}

          {status === "loading" && (
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="animate-spin">
                  <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
                </div>
              </div>
              <p className="text-[#D4AF37] font-semibold">{message}</p>
            </div>
          )}

          {status === "success" && (
            <div className="text-center">
              <div className="mb-4 text-5xl">🟢</div>
              <p className="text-[#D4AF37] font-semibold text-lg">{message}</p>
              <p className="text-gray-400 text-sm mt-3">Modal wird geschlossen...</p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center">
              <div className="mb-4 text-5xl">❌</div>
              <p className="text-red-400 mb-6 text-base font-semibold">{error}</p>
              <button
                onClick={() => {
                  setStatus("idle");
                  setError("");
                }}
                className="w-full py-3 px-4 rounded-lg font-bold uppercase tracking-wider text-sm bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black hover:from-[#E5C158] transition"
              >
                🔄 Erneut versuchen
              </button>
            </div>
          )}
        </div>

        {status === "idle" && (
          <div className="space-y-3">
            <button
              onClick={handleSaveSession}
              className="w-full py-3 px-4 rounded-lg font-bold uppercase tracking-wider text-sm bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black hover:from-[#E5C158] hover:shadow-lg hover:shadow-[#D4AF37]/40 transition"
            >
              ✓ Creator jetzt verbinden
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 px-4 rounded-lg font-semibold text-gray-400 hover:text-[#D4AF37] transition border border-gray-600 hover:border-[#D4AF37]"
            >
              Abbrechen
            </button>
          </div>
        )}

        {status !== "idle" && (
          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-lg font-semibold text-gray-400 hover:text-[#D4AF37] transition border border-gray-600 hover:border-[#D4AF37]"
          >
            Schließen
          </button>
        )}
      </div>
    </div>
  );
}
