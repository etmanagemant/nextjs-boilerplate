"use client";

import { useEffect, useRef, useState } from "react";

interface OnlyFansViewerProps {
  modelId: string;
  modelName?: string;
  onClose: () => void;
  isModal?: boolean;
  isEmbedded?: boolean;
}

/**
 * OnlyFansViewer - Modal component for viewing OnlyFans streams
 * Can be used as a modal overlay or embedded viewer
 */
export function OnlyFansViewer({ 
  modelId, 
  modelName = "OnlyFans", 
  onClose, 
  isModal = false,
  isEmbedded = true
}: OnlyFansViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);
  const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch screenshot
  const fetchScreenshot = async () => {
    try {
      const response = await fetch(
        `/api/crm/screenshot?modelId=${encodeURIComponent(modelId)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch screenshot");
      }

      const data = await response.json();
      setLastScreenshot(data.screenshot);
      setError(null);

      // Draw on canvas
      if (canvasRef.current && data.screenshot) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current?.getContext("2d");
          if (ctx) {
            canvasRef.current!.width = img.width;
            canvasRef.current!.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
          setIsLoading(false);
        };
        img.src = data.screenshot;
      }
    } catch (err: any) {
      console.error("[VIEWER] Screenshot error:", err);
      setError(err.message);
      setIsLoading(false);
    }
  };

  // Start polling screenshots
  useEffect(() => {
    console.log("[VIEWER] Starting for model:", modelId);
    setIsLoading(true);
    setError(null);

    const initializeAndPoll = async () => {
      try {
        // Step 1: Try to navigate to OnlyFans (may fail for existing sessions)
        console.log("[VIEWER] Attempting to navigate to OnlyFans...");
        const navigateResponse = await fetch("/api/crm/interact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId,
            action: "navigate",
            data: { url: "https://onlyfans.com", delay: 1000 },
          }),
        });

        if (navigateResponse.ok) {
          console.log("[VIEWER] ✅ Navigation successful");
        } else {
          const errorData = await navigateResponse.json();
          console.warn("[VIEWER] ⚠️ Navigation failed:", errorData.error);
          console.log("[VIEWER] 🔄 Will try screenshot anyway (session may already be loaded)");
          // Don't throw - continue to screenshot attempt
        }

        console.log("[VIEWER] Starting screenshot polling...");

        // Step 2: Fetch initial screenshot (works even if navigate failed)
        await fetchScreenshot();

        // Step 3: Start polling every 200ms
        if (screenshotIntervalRef.current) {
          clearInterval(screenshotIntervalRef.current);
        }
        screenshotIntervalRef.current = setInterval(() => {
          fetchScreenshot();
        }, 200);
      } catch (err: any) {
        console.error("[VIEWER] Initialization error:", err);
        setError(err.message || "Failed to initialize OnlyFans viewer");
        setIsLoading(false);
      }
    };

    initializeAndPoll();

    return () => {
      if (screenshotIntervalRef.current) {
        clearInterval(screenshotIntervalRef.current);
      }
    };
  }, [modelId]);

  // Handle canvas click
  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    setLastScreenshot(null);
    
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
    }

    const initializeAndPoll = async () => {
      try {
        // Step 1: Try to navigate to OnlyFans (may fail for existing sessions)
        console.log("[VIEWER] Retrying... attempting to navigate to OnlyFans...");
        const navigateResponse = await fetch("/api/crm/interact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId,
            action: "navigate",
            data: { url: "https://onlyfans.com", delay: 1000 },
          }),
        });

        if (navigateResponse.ok) {
          console.log("[VIEWER] ✅ Navigation successful on retry");
        } else {
          const errorData = await navigateResponse.json();
          console.warn("[VIEWER] ⚠️ Navigation failed on retry:", errorData.error);
          console.log("[VIEWER] 🔄 Will try screenshot anyway (session may already be loaded)");
        }

        console.log("[VIEWER] Starting screenshot polling on retry...");

        // Step 2: Fetch initial screenshot (works even if navigate failed)
        await fetchScreenshot();

        // Step 3: Start polling every 200ms
        if (screenshotIntervalRef.current) {
          clearInterval(screenshotIntervalRef.current);
        }
        screenshotIntervalRef.current = setInterval(() => {
          fetchScreenshot();
        }, 200);
      } catch (err: any) {
        console.error("[VIEWER] Retry error:", err);
        setError(err.message || "Failed to initialize OnlyFans viewer");
        setIsLoading(false);
      }
    };

    initializeAndPoll();
  };

  const handleRefreshSession = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch("/api/crm/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          action: "reload",
          data: { delay: 1500 },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to refresh session");
      }

      const data = await response.json();
      setLastScreenshot(data.screenshot);

      // Draw new screenshot
      if (canvasRef.current && data.screenshot) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current?.getContext("2d");
          if (ctx) {
            canvasRef.current!.width = img.width;
            canvasRef.current!.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
          setIsLoading(false);
        };
        img.src = data.screenshot;
      }
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  // Handle canvas click
  const handleCanvasClick = async (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    console.log(`[VIEWER] Click at ${x}, ${y}`);

    try {
      const response = await fetch("/api/crm/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          action: "click",
          data: { x, y, delay: 200 },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setLastScreenshot(data.screenshot);

        // Draw updated screenshot
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current?.getContext("2d");
          if (ctx) {
            canvasRef.current!.width = img.width;
            canvasRef.current!.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
        };
        img.src = data.screenshot;
      }
    } catch (err) {
      console.error("[VIEWER] Click error:", err);
    }
  };

  // Handle keyboard input
  const handleKeyDown = async (event: KeyboardEvent) => {
    // Only intercept typing in input fields
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    // For now, skip keyboard handling in canvas
    // We'll implement this for message input specifically
  };

  // Wrapper element (can be modal, embedded, or standalone)
  const viewerContent = (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/80 to-transparent p-3 flex items-center justify-between">
        <h3 className="text-white font-bold text-lg">{modelName}</h3>
        <div className="flex gap-2">
          <button
            onClick={fetchScreenshot}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition"
            title="Refresh screenshot"
          >
            📸 Screenshot
          </button>
          <button
            onClick={handleRefreshSession}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm transition"
            title="Reload page and refresh session"
          >
            🔄 Reload
          </button>
          {!isEmbedded && (
            <button
              onClick={onClose}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm transition"
              title="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="text-white text-center">
            <div className="animate-spin mb-4">⏳</div>
            <p>Loading OnlyFans...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
          <div className="bg-red-950/80 border border-red-500 rounded-lg p-6 text-red-300 max-w-2xl">
            <p className="font-bold mb-2 text-red-100">⚠️ OnlyFans Stream Error</p>
            
            {/* Error Message */}
            <div className="bg-red-950/50 rounded p-3 mb-4 text-sm font-mono">
              <p>{error}</p>
            </div>

            {/* Diagnostic Help */}
            <div className="text-xs text-red-300/70 mb-4 border border-red-700/30 rounded p-3">
              <p className="font-bold mb-2">Debugging Info:</p>
              <ul className="list-disc list-inside space-y-1">
                {error.includes("No active session") && (
                  <>
                    <li>Model ID: <span className="font-mono">{modelId}</span></li>
                    <li>⚠️ No active Browserless session found for this model</li>
                    <li>👉 Try: Setup model in /management/crm-connect first</li>
                  </>
                )}
                {error.includes("Session configuration missing") && (
                  <>
                    <li>Session exists but configuration is incomplete</li>
                    <li>👉 Try: Refresh the model or re-authenticate</li>
                  </>
                )}
                {error.includes("Bad Request") && (
                  <>
                    <li>Browserless API rejected the request (HTTP 400)</li>
                    <li>Session may be invalid, expired, or corrupted</li>
                    <li>👉 Try: Click "Refresh Session" or reconnect model</li>
                    <li>👉 If issue persists: Go to /management/crm-connect and re-setup</li>
                  </>
                )}
                {error.includes("Authentication failed") && (
                  <>
                    <li>Browserless API authentication error (HTTP 401)</li>
                    <li>Server configuration issue - Contact admin</li>
                  </>
                )}
                {error.includes("Rate limited") && (
                  <>
                    <li>Too many requests to Browserless API</li>
                    <li>👉 Wait a moment and then retry</li>
                  </>
                )}
                {error.includes("Navigation failed") && (
                  <>
                    <li>Failed to navigate to OnlyFans</li>
                    <li>Session may not be properly authenticated</li>
                    <li>👉 Try: Refresh session or check browser logs (F12)</li>
                  </>
                )}
                {!error.includes("No active session") && !error.includes("configuration") && !error.includes("Bad Request") && !error.includes("Authentication") && !error.includes("Rate limited") && !error.includes("Navigation") && (
                  <li>Unknown error - Check browser console (F12) for full trace</li>
                )}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="flex-1 px-4 py-2 bg-red-600 rounded text-white text-sm hover:bg-red-700 transition"
              >
                🔄 Retry
              </button>
              <button
                onClick={handleRefreshSession}
                className="flex-1 px-4 py-2 bg-orange-600 rounded text-white text-sm hover:bg-orange-700 transition"
              >
                🔗 Refresh Session
              </button>
              {isModal && (
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-700 rounded text-white text-sm hover:bg-gray-800 transition"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Canvas - OnlyFans Stream */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-full object-contain cursor-pointer"
        style={{ maxHeight: "100%" }}
      />
    </div>
  );

  // If modal mode, wrap in backdrop
  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl h-[90vh] rounded-xl overflow-hidden shadow-2xl border border-purple-600/30">
          {viewerContent}
        </div>
      </div>
    );
  }

  // If embedded mode, return full-size viewer (no padding/rounded)
  if (isEmbedded) {
    return (
      <div className="w-full h-full bg-black overflow-hidden">
        {viewerContent}
      </div>
    );
  }

  // Otherwise return bare viewer with rounded corners
  return viewerContent;
}
