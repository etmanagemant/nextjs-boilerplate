"use client";

import { useEffect, useRef, useState } from "react";

interface OnlyFansViewerProps {
  modelId: string;
  onClose: () => void;
}

export function OnlyFansViewer({ modelId, onClose }: OnlyFansViewerProps) {
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

    // Initial fetch
    fetchScreenshot();

    // Poll every 200ms
    screenshotIntervalRef.current = setInterval(() => {
      fetchScreenshot();
    }, 200);

    return () => {
      if (screenshotIntervalRef.current) {
        clearInterval(screenshotIntervalRef.current);
      }
    };
  }, [modelId]);

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

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded p-4 text-red-300">
        <p className="font-bold">Error loading OnlyFans</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => {
            setError(null);
            fetchScreenshot();
          }}
          className="mt-2 px-3 py-1 bg-red-600 rounded text-white text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="text-white text-center">
            <div className="animate-spin mb-4">⏳</div>
            <p>Loading OnlyFans...</p>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-full object-contain cursor-pointer"
        style={{ maxHeight: "100%" }}
      />

      <div className="absolute top-2 right-2 z-20 flex gap-2">
        <button
          onClick={fetchScreenshot}
          className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm"
          title="Refresh screenshot"
        >
          🔄
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
