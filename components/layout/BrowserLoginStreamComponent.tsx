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
    "idle" | "loading" | "authenticated" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );

  // 🚀 START HEADLESS BROWSER SESSION
  const handleStartBrowserLogin = async () => {
    setIsConnecting(true);
    setAuthStatus("loading");
    setErrorMessage("");
    setStatusMessage("Starte Playwright Browser-Sitzung...");

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

      setIsBrowserRunning(true);
      setStatusMessage("⏳ Bitte logge dich im folgenden Fenster bei OnlyFans ein und löse das Captcha...");

      // 📊 START POLLING for authentication status
      const interval = setInterval(async () => {
        try {
          const statusResponse = await fetch(
            `/api/crm/browser-login/status?modelId=${modelId}`
          );
          const statusData = await statusResponse.json();

          if (statusData.authenticated) {
            setAuthStatus("authenticated");
            setStatusMessage("✅ Authentifizierung erfolgreich erkannt!");
            clearInterval(interval);
            setPollingInterval(null);
          }
        } catch (err) {
          console.error("Status polling error:", err);
        }
      }, 3000); // Poll every 3 seconds

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
        onClose();
        setIsBrowserRunning(false);
        setAuthStatus("idle");
        setStatusMessage("");
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
              onClick={onClose}
              disabled={isBrowserRunning}
              className="text-slate-400 hover:text-[#D4AF37] font-bold text-2xl disabled:opacity-50"
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
                {/* Skeleton Loader while connecting */}
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

                {/* Browser Stream Placeholder (would be replaced with actual WebSocket stream) */}
                {authStatus !== "authenticated" && (
                  <div className="absolute inset-0 flex items-center justify-center text-center">
                    <div>
                      <p className="text-4xl mb-4">🌐</p>
                      <p className="text-[#D4AF37] font-bold text-lg">
                        OnlyFans Browser
                      </p>
                      <p className="text-slate-500 text-xs mt-2">
                        Stream wird hier angezeigt...
                      </p>
                    </div>
                  </div>
                )}

                {/* Success State */}
                {authStatus === "authenticated" && (
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-emerald-900/20 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-6xl mb-4 animate-bounce">✅</p>
                      <p className="text-emerald-400 font-bold text-xl">
                        Authentifizierung bestätigt!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-black/40 p-4 rounded-lg border border-[#AA7C11]/10">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {authStatus === "loading" &&
                    "⏳ Bitte melden Sie sich auf der OnlyFans-Website an. Nachdem Sie Ihr Konto erfolgreich authentifiziert haben, wird unser System die Sitzung automatisch erkennen."}
                  {authStatus === "authenticated" &&
                    "✅ Ihr OnlyFans-Konto wurde erfolgreich authentifiziert. Klicken Sie auf den goldenen Button unten, um die Verbindung zu finalisieren."}
                  {authStatus === "error" &&
                    "❌ Es gab ein Problem mit dem Browser-Prozess. Bitte versuchen Sie es erneut."}
                </p>
              </div>
            </div>
          ) : (
            /* Initial State - Start Button */
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <p className="text-center text-slate-400 max-w-lg">
                Klicken Sie auf den Button unten, um den automatisierten OnlyFans
                Login-Prozess zu starten. Ihr Webbrowser wird sich öffnen und Sie
                werden aufgefordert, sich anzumelden.
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
                Dieser Prozess öffnet einen automatisierten Browser und speichert
                die Authentifizierungscookies sicher.
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
