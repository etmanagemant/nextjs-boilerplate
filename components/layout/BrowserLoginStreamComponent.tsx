"use client";

import React, { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabaseClient";

interface BrowserLoginStreamComponentProps {
  modelId: string;
  modelName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BrowserLoginStreamComponent({
  modelId,
  modelName,
  onClose,
  onSuccess,
}: BrowserLoginStreamComponentProps) {
  const [status, setStatus] = useState<"idle" | "opening" | "waiting" | "verified" | "connecting" | "error">("idle");
  const [sessionId, setSessionId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [cookieCount, setCookieCount] = useState(0);
  const [vpsStreamUrl, setVpsStreamUrl] = useState<string>("");
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Step 1: Open browser window for manual login
  const handleOpenBrowser = async () => {
    setStatus("opening");
    setMessage("🔄 Initializing browser session...");
    setError("");

    try {
      const response = await fetch("/api/crm/browser-login/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to init session");
      }

      const data = await response.json();
      const { sessionId: sid } = data;

      setSessionId(sid);
      console.log("✅ Session created:", sid);

      // Set VPS stream URL directly in modal (bypass popup blocker)
      setVpsStreamUrl(`http://80.240.30.188:3000/stream?sessionId=${sid}`);

      setStatus("waiting");
      setMessage("🌐 Browser stream loading... Please login to OnlyFans with the model credentials.");

      // Start polling to check if user logged in
      startPolling(sid);
    } catch (err: any) {
      setStatus("error");
      setError(err.message || "Failed to initialize browser session");
      console.error("❌ Error:", err);
    }
  };

  // Step 2: Poll to check if user logged in
  const startPolling = (sid: string) => {
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes with 1 second interval

    pollingIntervalRef.current = setInterval(async () => {
      attempts++;

      try {
        const response = await fetch(
          `/api/crm/browser-login/verify?sessionId=${sid}`,
          { method: "GET" }
        );

        if (!response.ok) {
          console.log(`[Polling] Check attempt ${attempts}/${maxAttempts}...`);
          return;
        }

        const data = await response.json();

        if (data.isLoggedIn) {
          console.log("✅ Login detected!");
          setCookieCount(data.cookieCount || 0);
          setStatus("verified");
          setMessage(`✅ Login detected! ${data.cookieCount} cookies found.`);

          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          return;
        }

        if (attempts % 10 === 0) {
          console.log(`[Polling] ${attempts} seconds - still waiting...`);
        }
      } catch (err) {
        console.error("[Polling] Error:", err);
      }

      if (attempts >= maxAttempts) {
        setStatus("error");
        setMessage("Timeout: Login verification took too long");
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      }
    }, 1000);
  };

  // Step 3: Confirm and save session
  const handleConfirmConnection = async () => {
    setStatus("connecting");
    setMessage("💾 Saving session to database...");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch("/api/crm/browser-login/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ modelId, sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to confirm session");
      }

      const data = await response.json();
      console.log("✅ Session confirmed:", data);

      setStatus("idle");
      setMessage("🎉 Model connected successfully!");

      // Close browser window
      // Close modal
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setStatus("error");
      setError(err.message || "Failed to confirm session");
      console.error("❌ Error:", err);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] border border-[#D4AF37]/30 rounded-lg shadow-2xl max-w-lg w-full p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-[#D4AF37]">🌐 Browser Login</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-[#D4AF37] transition"
          >
            ✕
          </button>
        </div>

        <div className="mb-6 p-4 bg-black/40 rounded-lg border border-[#D4AF37]/20">
          <p className="text-gray-300">
            <span className="font-bold text-[#D4AF37]">Model:</span> {modelName}
          </p>
        </div>

        <div className="mb-6">
          {status === "idle" && (
            <div className="text-center">
              <p className="text-gray-300 mb-4">
                Click the button to open a browser window. Then login with model credentials.
              </p>
              <button
                onClick={handleOpenBrowser}
                className="w-full py-3 px-4 rounded-lg font-bold uppercase tracking-wider text-sm bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black hover:from-[#E5C158] hover:shadow-lg hover:shadow-[#D4AF37]/40 transition"
              >
                🌐 Open Browser
              </button>
            </div>
          )}

          {status === "opening" && (
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="animate-spin">
                  <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
                </div>
              </div>
              <p className="text-[#D4AF37] font-semibold">{message}</p>
            </div>
          )}

          {status === "waiting" && (
            <div>
              <div className="mb-4 bg-black/60 rounded-lg border border-[#D4AF37]/30 overflow-hidden aspect-video flex items-center justify-center">
                {vpsStreamUrl ? (
                  <iframe
                    src={vpsStreamUrl}
                    className="w-full h-full border-0"
                    title="OnlyFans Browser Stream"
                    sandbox="allow-same-origin allow-scripts"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <div className="mb-4 flex justify-center">
                      <div className="animate-spin">
                        <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
                      </div>
                    </div>
                    <p className="text-gray-400 text-sm">Initializing stream...</p>
                  </div>
                )}
              </div>
              <p className="text-gray-300 mb-2 text-center text-sm">{message}</p>
              <p className="text-xs text-gray-500 text-center">Waiting for login confirmation...</p>
            </div>
          )}

          {status === "verified" && (
            <div className="text-center">
              <div className="mb-4 text-4xl">✅</div>
              <p className="text-[#D4AF37] font-semibold mb-4">{message}</p>
              <button
                onClick={handleConfirmConnection}
                className="w-full py-3 px-4 rounded-lg font-bold uppercase tracking-wider text-sm bg-gradient-to-b from-green-500 to-green-700 text-white hover:from-green-400 hover:shadow-lg hover:shadow-green-500/40 transition"
              >
                ✓ Confirm & Connect
              </button>
            </div>
          )}

          {status === "connecting" && (
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="animate-spin">
                  <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
                </div>
              </div>
              <p className="text-[#D4AF37] font-semibold">{message}</p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center">
              <div className="mb-4 text-4xl">❌</div>
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => {
                  setStatus("idle");
                  setError("");
                  setSessionId("");
                  setCookieCount(0);
                }}
                className="w-full py-2 px-4 rounded-lg font-bold uppercase tracking-wider text-sm bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black hover:from-[#E5C158] transition"
              >
                🔄 Try Again
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 px-4 rounded-lg font-semibold text-gray-400 hover:text-[#D4AF37] transition border border-gray-600 hover:border-[#D4AF37]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
