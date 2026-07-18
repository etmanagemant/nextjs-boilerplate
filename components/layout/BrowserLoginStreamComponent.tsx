"use client";

import { useState, useEffect, useRef } from "react";

interface BrowserLoginStreamProps {
  modelId: string;
  modelName: string;
  onConnectionSuccess: () => void;
  onClose: () => void;
}

export default function BrowserLoginStreamComponent({
  modelId,
  modelName,
  onConnectionSuccess,
  onClose,
}: BrowserLoginStreamProps) {
  const [isBrowserRunning, setIsBrowserRunning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [authStatus, setAuthStatus] = useState<
    "idle" | "loading" | "waiting" | "authenticated" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );
  const [verificationAttempts, setVerificationAttempts] = useState(0);

  // 🎯 CREDENTIALS STATE
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // 🎯 USE REF FOR SESSIONID - Synchronous, no state batching issues
  const sessionIdRef = useRef<string>("");

  // 🚀 START HEADLESS BROWSER SESSION WITH CREDENTIALS
  const handleStartBrowserLogin = async () => {
    // Validate credentials
    if (!username.trim() || !password.trim()) {
      setErrorMessage("Bitte geben Sie Username und Passwort ein");
      return;
    }

    setIsConnecting(true);
    setAuthStatus("loading");
    setErrorMessage("");
    setStatusMessage("🚀 Verbindung zu VPS wird hergestellt...");
    setVerificationAttempts(0);

    try {
      console.log("📤 Sending request to /api/crm/browser-login");
      
      const response = await fetch("/api/crm/browser-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          modelId,
          username,
          password,
        }),
      });

      console.log(`📥 Response status: ${response.status}`);
      console.log(`Content-Type: ${response.headers.get("content-type")}`);

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const responseText = await response.text();
        console.error("❌ Response is not JSON:", responseText.substring(0, 500));
        throw new Error(
          `Server error (${response.status}). Check browser DevTools Network tab for detailed error.`
        );
      }

      const data = await response.json();
      console.log("✅ Response JSON parsed:", data);

      if (!response.ok) {
        console.error("❌ API Error Response:", data);
        throw new Error(
          data.error || `Server error: ${data.errorType || "Unknown"}`
        );
      }

      // Store session ID for verification - USE REF FOR SYNCHRONOUS ACCESS!
      sessionIdRef.current = data.sessionId;
      console.log("✅ Session ID stored in ref:", sessionIdRef.current);
      setIsBrowserRunning(true);
      setAuthStatus("authenticated");
      setStatusMessage("✅ OnlyFans-Login erfolgreich! Verbindung gespeichert.");

    } catch (err: any) {
      console.error("❌ Browser login error:", err);
      setAuthStatus("error");
      setErrorMessage(
        err.message || "Failed to start browser session. Check console for details."
      );
      setIsBrowserRunning(false);
    } finally {
      setIsConnecting(false);
    }
  };

  // 👑 FINALIZE CONNECTION - Ready to go!
  const handleFinalizeConnection = async () => {
    try {
      setStatusMessage("Finalisiere Verbindung...");

      // Clear polling interval if any
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }

      // Call success callback to refresh sessions
      onConnectionSuccess();

      // Show success message
      setStatusMessage("🎉 Creator erfolgreich verbunden!");

      // Close panel after 2 seconds
      setTimeout(() => {
        handleCloseModal();
      }, 2000);
    } catch (err) {
      console.error("Finalization error:", err);
      setAuthStatus("error");
      setErrorMessage("Failed to finalize connection");
    }
  };

  // 🧹 CLEANUP BROWSER SESSION
  const handleCloseModal = () => {
    // Stop polling if running
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    // Clear ref
    sessionIdRef.current = "";
    // Reset state
    setIsBrowserRunning(false);
    setAuthStatus("idle");
    setStatusMessage("");
    setErrorMessage("");
    setVerificationAttempts(0);
    setUsername("");
    setPassword("");
    // Close modal
    onClose();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#0A0A0A] border-2 border-[#D4AF37] rounded-2xl shadow-2xl shadow-[#D4AF37]/30 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#D4AF37]/20 to-[#AA7C11]/20 px-8 py-6 border-b border-[#D4AF37]/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#D4AF37] uppercase tracking-wider">
                <span>🔮</span> Automatisches Creator Onboarding
              </h2>
              <p className="text-sm text-slate-400 mt-2">
                Creator: <span className="text-[#D4AF37]">{modelName}</span>
              </p>
            </div>
            <button
              onClick={handleCloseModal}
              className="text-slate-400 hover:text-[#D4AF37] font-bold text-2xl hover:scale-110 transition"
              title="Modal schließen"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          {/* STATUS MESSAGE */}
          {statusMessage && (
            <div className="p-4 bg-[#AA7C11]/10 border border-[#D4AF37]/30 rounded-lg">
              <p className="text-sm text-[#F3E5AB] text-center animate-pulse">
                {statusMessage}
              </p>
            </div>
          )}

          {/* ERROR MESSAGE */}
          {errorMessage && (
            <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-sm text-red-300">
                <span className="font-bold">❌ Fehler:</span> {errorMessage}
              </p>
            </div>
          )}

          {/* LIVE STREAM CONTAINER */}
          {isBrowserRunning ? (
            <div className="space-y-4">
              {/* Viewport / Loading State */}
              <div className="relative w-full aspect-video bg-gradient-to-br from-[#050505] to-black border-2 border-[#AA7C11]/30 rounded-xl overflow-hidden">
                {/* Loading State - Session starting */}
                {authStatus === "loading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="space-y-4 w-3/4">
                      {/* Animated skeleton bars */}
                      <div className="h-6 bg-gradient-to-r from-[#D4AF37]/20 via-[#D4AF37]/40 to-[#D4AF37]/20 rounded-full animate-pulse"></div>
                      <div className="h-4 bg-gradient-to-r from-[#D4AF37]/20 via-[#D4AF37]/40 to-[#D4AF37]/20 rounded-full animate-pulse"></div>
                      <div className="h-4 bg-gradient-to-r from-[#D4AF37]/20 via-[#D4AF37]/40 to-[#D4AF37]/20 rounded-full animate-pulse w-2/3"></div>
                    </div>
                  </div>
                )}

                {/* Waiting State - Waiting for user to authenticate */}
                {authStatus === "waiting" && (
                  <div className="absolute inset-0 flex items-center justify-center text-center bg-gradient-to-br from-blue-500/10 to-blue-900/10">
                    <div className="space-y-4">
                      <p className="text-6xl animate-spin">⏳</p>
                      <p className="text-[#D4AF37] font-bold text-lg">
                        Authentifizierung wird verarbeitet...
                      </p>
                      <p className="text-slate-400 text-sm">
                        Bitte warten Sie...
                      </p>
                    </div>
                  </div>
                )}

                {/* Placeholder - When not running */}
                {!isBrowserRunning && authStatus === "idle" && (
                  <div className="absolute inset-0 flex items-center justify-center text-center">
                    <div>
                      <p className="text-4xl mb-4">🔐</p>
                      <p className="text-[#D4AF37] font-bold text-lg">
                        OnlyFans Login
                      </p>
                      <p className="text-slate-500 text-xs mt-2">
                        Credentials unten eingeben...
                      </p>
                    </div>
                  </div>
                )}

                {/* Success State - Authenticated! */}
                {authStatus === "authenticated" && (
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-emerald-900/20 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-6xl mb-4 animate-bounce">✅</p>
                      <p className="text-emerald-400 font-bold text-xl">
                        OnlyFans-Authentifizierung bestätigt!
                      </p>
                      <p className="text-emerald-300 text-sm mt-2">
                        Cookies wurden sicher gespeichert
                      </p>
                    </div>
                  </div>
                )}

                {/* Error State */}
                {authStatus === "error" && (
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-red-900/20 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-6xl mb-4">❌</p>
                      <p className="text-red-400 font-bold text-lg">
                        Fehler bei der Authentifizierung
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-black/40 p-4 rounded-lg border border-[#AA7C11]/10">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {authStatus === "loading" &&
                    "⏳ Verbinde zu VPS und starte Puppeteer Browser..."}
                  {authStatus === "authenticated" &&
                    "✅ OnlyFans-Login erfolgreich! Session wurde gespeichert. Klicken Sie auf den goldenen Button unten, um die Verbindung zu finalisieren."}
                  {authStatus === "error" &&
                    "❌ Es gab ein Problem mit dem Browser-Prozess. Bitte überprüfen Sie Ihre Anmeldedaten und versuchen Sie es erneut."}
                  {authStatus === "idle" &&
                    "Geben Sie Ihren OnlyFans-Username und Passwort ein."}
                </p>
              </div>
            </div>
          ) : (
            /* Initial State - Credentials Input */
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <p className="text-center text-slate-400 max-w-lg">
                Geben Sie die OnlyFans-Anmeldedaten ein. Das System wird sich automatisch anmelden und die Session speichern.
              </p>

              <div className="w-full max-w-md space-y-4">
                {/* Username Input */}
                <div>
                  <label className="block text-sm text-[#D4AF37] font-semibold mb-2">
                    📧 OnlyFans Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="E-Mail oder Username"
                    className="w-full px-4 py-3 bg-black/40 border border-[#AA7C11]/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#D4AF37] transition"
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-sm text-[#D4AF37] font-semibold mb-2">
                    🔐 Passwort
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Passwort"
                    className="w-full px-4 py-3 bg-black/40 border border-[#AA7C11]/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#D4AF37] transition"
                  />
                </div>

                {/* Login Button */}
                <button
                  onClick={handleStartBrowserLogin}
                  disabled={isConnecting || !username.trim() || !password.trim()}
                  className="w-full px-8 py-4 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#BB8D23] text-black font-bold uppercase tracking-wider text-lg rounded-lg shadow-lg shadow-[#D4AF37]/40 hover:shadow-[#D4AF37]/60 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnecting ? (
                    "⏳ Verbinde..."
                  ) : (
                    <>
                      <span>🌐</span> Zur OnlyFans verbinden
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                Ihre Anmeldedaten werden nur zur Authentifizierung verwendet
                und sicher in der Datenbank gespeichert.
              </p>
            </div>
          )}

          {/* GOLDEN FINALIZE BUTTON - Shows when authenticated */}
          {authStatus === "authenticated" && (
            <div className="pt-4 border-t border-[#AA7C11]/20">
              <button
                onClick={handleFinalizeConnection}
                className="w-full px-8 py-6 bg-gradient-to-b from-[#D4AF37] via-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:via-[#E5C158] hover:to-[#BB8D23] text-black font-black uppercase tracking-widest text-xl rounded-lg shadow-2xl shadow-[#D4AF37]/50 hover:shadow-[#D4AF37]/80 transition animate-pulse"
              >
                <span>👑</span> CREATOR JETZT VERBINDEN
              </button>
              <p className="text-xs text-slate-500 text-center mt-3">
                Klicken Sie, um die Verbindung abzuschließen.
              </p>
            </div>
          )}

          {/* RETRY - Goes back to idle state */}
          {authStatus === "error" && (
            <div className="pt-4 border-t border-[#AA7C11]/20">
              <button
                onClick={() => {
                  setAuthStatus("idle");
                  setErrorMessage("");
                  setStatusMessage("");
                }}
                className="w-full px-6 py-3 bg-[#D4AF37]/20 hover:bg-[#D4AF37]/40 text-[#D4AF37] font-bold uppercase tracking-wider rounded-lg border border-[#D4AF37]/50 transition"
              >
                <span>🔄</span> Erneut versuchen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
