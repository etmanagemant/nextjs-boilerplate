import WebSocket from "ws";

/**
 * Send Chrome DevTools Protocol (CDP) command via WebSocket
 * Used for persistent Browserless sessions
 */
export async function sendCDPCommand(
  wsEndpoint: string,
  command: { method: string; params?: Record<string, unknown> },
  timeoutMs: number = 30000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let timeout: NodeJS.Timeout | null = null;
    let messageId = 1;

    try {
      console.log(`[CDP] Connecting to: ${wsEndpoint.substring(0, 80)}...`);
      ws = new WebSocket(wsEndpoint);

      // Setup timeout
      timeout = setTimeout(() => {
        console.error(`[CDP] Timeout after ${timeoutMs}ms`);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        reject(new Error(`CDP timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      ws.addEventListener("error", (event: any) => {
        const errMsg = event?.message || event?.error || "Unknown error";
        console.error("[CDP] WebSocket error:", errMsg);
        if (timeout) clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${errMsg}`));
      });

      ws.addEventListener("open", () => {
        console.log("[CDP] ✅ WebSocket connected, sending command:", command.method);
        const message = {
          id: messageId,
          method: command.method,
          params: command.params || {},
        };
        try {
          ws!.send(JSON.stringify(message));
        } catch (e) {
          console.error("[CDP] Failed to send message:", e);
          reject(e);
        }
      });

      ws.addEventListener("message", (event: any) => {
        try {
          const response = JSON.parse(event.data);
          console.log("[CDP] Received response for id:", response.id);

          // Check if this is a response to our command
          if (response.id === messageId) {
            if (timeout) clearTimeout(timeout);
            
            if (response.error) {
              console.error("[CDP] Error response:", response.error);
              ws?.close();
              reject(new Error(`CDP error: ${response.error.message}`));
            } else if (response.result) {
              console.log("[CDP] ✅ Success, result keys:", Object.keys(response.result).slice(0, 5));
              ws?.close();
              resolve(response.result);
            } else {
              console.log("[CDP] ✅ Success, response:", response);
              ws?.close();
              resolve(response);
            }
          }
        } catch (e) {
          console.error("[CDP] Failed to parse message:", e);
          if (timeout) clearTimeout(timeout);
          ws?.close();
          reject(e);
        }
      });

      ws.addEventListener("close", () => {
        console.log("[CDP] WebSocket closed");
        if (timeout) clearTimeout(timeout);
      });
    } catch (error) {
      console.error("[CDP] Fatal error:", error);
      if (timeout) clearTimeout(timeout);
      if (ws) ws.close();
      reject(error);
    }
  });
}
