"use client";

import { useState, useEffect } from "react";

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
  const [sessionId, setSessionId] = useState<string>("");
  const [verificationAttempts, setVerificationAttempts] = useState(0);

  // 🚀 START HEADLESS BROWSER SESSION
  const handleStartBrowserLogin = async () => {
    setIsConnecting(true);
    setAuthStatus("loading");
    setErrorMessage("");
    setStatusMessage("🚀 Starte Browserless Session...");
    setVerificationAttempts(0);

    try {
      console.log("📤 Sending request to /api/crm/browser-login");
      
      const response = await fetch("/api/crm/browser-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
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

      // Store session ID for verification
      setSessionId(data.sessionId);
      setIsBrowserRunning(true);
      setAuthStatus("waiting");
      setStatusMessage("⏳ Bitte logge dich im Browser ein und löse das Captcha...\n\nWir warten auf die Bestätigung deiner OnlyFans-Authentifizierung.");

      // 📊 START POLLING for VERIFICATION - only mark connected when REAL auth is detected
      let attempts = 0;
      const maxAttempts = 300; // 5 minutes at 1 second intervals (300 seconds)
      
      const interval = setInterval(async () => {
        attempts++;
        setVerificationAttempts(attempts);

        try {
          // ⚠️ Use new /verify endpoint that checks browser session status
          const verifyResponse = await fetch(
            "/api/crm/browser-login/verify",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                modelId,
              }),
            }
          );

          const verifyData = await verifyResponse.json();
          console.log(`[Attempt ${attempts}] Verification response:`, verifyData.status, verifyData);

          // Handle non-OK responses but don't crash
          if (!verifyResponse.ok) {
            console.warn(`⚠️ Verification check: ${verifyResponse.status}`, verifyData.error);
            return;
          }

          // ✅ REAL VERIFICATION - only set to authenticated when backend confirms
          if (verifyData.verified === true) {
            setAuthStatus("authenticated");
            setStatusMessage("✅ OnlyFans-Authentifizierung bestätigt und sicher gespeichert!");
            clearInterval(interval);
            setPollingInterval(null);
            console.log("🎉 User authenticated after", attempts, "attempts");
          } else if (verifyData.status === "waiting") {
            // Still waiting - browser session active but no auth yet
            setStatusMessage(
              `⏳ Warte auf OnlyFans-Anmeldung... (Versuch ${attempts})`
            );
          } else if (verifyData.status === "error") {
            // Error - session died or something went wrong
            console.error("❌ Verification error:", verifyData.error);
            clearInterval(interval);
            setPollingInterval(null);
            setAuthStatus("error");
            setErrorMessage(verifyData.error || "Verification failed");
            setIsBrowserRunning(false);
          }

        } catch (err) {
          console.error("Verification polling error:", err);
        }

        // Timeout after 5 minutes
        if (attempts >= maxAttempts) {
          console.warn("⏱️ Verification timeout - 5 minutes elapsed");
          clearInterval(interval);
          setPollingInterval(null);
          setAuthStatus("error");
          setErrorMessage(
            "Timeout: Keine OnlyFans-Authentifizierung erkannt. Der Browser wurde geschlossen."
          );
          setIsBrowserRunning(false);
        }
      }, 1000); // Poll every 1 second

      setPollingInterval(interval);
    } catch (err: any) {
      console.error("❌ Browser login error:", err);
      setAuthStatus("error");
      setErrorMessage(
        err.message || "Failed to start browser session. Check console for details."
      );
      setIsBrowserRunning(false);
      setIsConnecting(false);
    } finally {
      setIsConnecting(false);
    }
  };

  // 🧹 CLEANUP BROWSER SESSION
  const handleCloseModal = () => {
    // Stop polling if running
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    // Reset state
    setIsBrowserRunning(false);
    setAuthStatus("idle");
    setStatusMessage("");
    setErrorMessage("");
    setVerificationAttempts(0);
    // Close modal
    onClose();
  };

  // 👑 FINALIZE CONNECTION
  const handleFinalizeConnection = async () => {
    try {
      setStatusMessage("Finalisiere Verbindung...");

      // Clear polling interval
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
                        Warte auf OnlyFans-Anmeldung
                      </p>
                      <p className="text-slate-400 text-sm">
                        Bitte melden Sie sich im Browser an...
                      </p>
                      <p className="text-slate-500 text-xs">
                        Versuche: {verificationAttempts}/300
                      </p>
                    </div>
                  </div>
                )}

                {/* Placeholder - When not running */}
                {!isBrowserRunning && authStatus === "idle" && (
                  <div className="absolute inset-0 flex items-center justify-center text-center">
                    <div>
                      <p className="text-4xl mb-4">🌐</p>
                      <p className="text-[#D4AF37] font-bold text-lg">
                        OnlyFans Browser
                      </p>
                      <p className="text-slate-500 text-xs mt-2">
                        Klicken Sie unten zum Starten...
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
                    "⏳ Starte Browser-Session..."}
                  {authStatus === "waiting" &&
                    "⏳ Bitte melden Sie sich auf OnlyFans an. Das System wartet auf die Bestätigung Ihrer Authentifizierung. Dies kann bis zu 5 Minuten dauern."}
                  {authStatus === "authenticated" &&
                    "✅ Ihre OnlyFans-Authentifizierung wurde bestätigt und die Cookies wurden sicher gespeichert. Klicken Sie auf den goldenen Button unten, um die Verbindung zu finalisieren."}
                  {authStatus === "error" &&
                    "❌ Es gab ein Problem mit dem Browser-Prozess oder die Authentifizierung hat zu lange gedauert. Bitte versuchen Sie es erneut."}
                </p>
              </div>
            </div>
          ) : (
            /* Initial State - Start Button */
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <p className="text-center text-slate-400 max-w-lg">
                Klicken Sie auf den Button, um den Browserless-Login-Prozess zu starten. 
                Sie werden aufgefordert, sich bei OnlyFans anzumelden. Das System wartet dann 
                auf die Authentifizierung und speichert die Cookies sicher.
              </p>

              <button
                onClick={handleStartBrowserLogin}
                disabled={isConnecting}
                className="px-8 py-4 bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:to-[#BB8D23] text-black font-bold uppercase tracking-wider text-lg rounded-lg shadow-lg shadow-[#D4AF37]/40 hover:shadow-[#D4AF37]/60 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? (
                  "⏳ Startet..."
                ) : (
                  <>
                    <span>🌐</span> Live-Login starten
                  </>
                )}
              </button>

              <p className="text-xs text-slate-500 text-center">
                Dieser Prozess startet einen sicheren Browser und speichert
                die OnlyFans-Authentifizierungscookies verschlüsselt in der Datenbank.
              </p>
            </div>
          )}

          {/* GOLDEN CONNECTION BUTTON - Shows when authenticated */}
          {authStatus === "authenticated" && (
            <div className="pt-4 border-t border-[#AA7C11]/20">
              <button
                onClick={handleFinalizeConnection}
                className="w-full px-8 py-6 bg-gradient-to-b from-[#D4AF37] via-[#D4AF37] to-[#AA7C11] hover:from-[#E5C158] hover:via-[#E5C158] hover:to-[#BB8D23] text-black font-black uppercase tracking-widest text-xl rounded-lg shadow-2xl shadow-[#D4AF37]/50 hover:shadow-[#D4AF37]/80 transition animate-pulse"
              >
                <span>👑</span> SITZUNG VALIDIERT: CREATOR JETZT VERBINDEN
              </button>
              <p className="text-xs text-slate-500 text-center mt-3">
                Klicken Sie, um die Verbindung abzuschließen und zur
                Verwaltungsoberfläche zurückzukehren.
              </p>
            </div>
          )}

          {/* RETRY BUTTON - Shows on error */}
          {authStatus === "error" && !isBrowserRunning && (
            <div className="pt-4 border-t border-[#AA7C11]/20">
              <button
                onClick={handleStartBrowserLogin}
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
