import WebSocket from "ws";

/**
 * Send Chrome DevTools Protocol (CDP) command via WebSocket
 * Used for persistent Browserless sessions
 * 
 * @param wsEndpoint - Full WebSocket endpoint from Browserless (wss://...)
 * @param command - CDP command: { method: "Page.captureScreenshot", params: {} }
 * @param timeoutMs - Timeout for response (default: 30000ms)
 * @returns Command result or null if failed
 */
export async function sendCDPCommand(
  wsEndpoint: string,
  command: { method: string; params?: Record<string, unknown> },
  timeoutMs: number = 30000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let timeout: NodeJS.Timeout | null = null;

    try {
      ws = new WebSocket(wsEndpoint);

      // Setup timeout
      timeout = setTimeout(() => {
        if (ws) {
          ws.close();
        }
        reject(new Error(`CDP command timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      ws.on("error", (error) => {
        if (timeout) clearTimeout(timeout);
        console.error("[CDP] WebSocket error:", error);
        reject(error);
      });

      ws.on("open", () => {
        console.log("[CDP] WebSocket connected");
        const message = {
          id: 1,
          method: command.method,
          params: command.params || {},
        };
        ws!.send(JSON.stringify(message));
      });

      ws.on("message", (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          console.log("[CDP] Response received:", response);

          if (timeout) clearTimeout(timeout);
          if (ws) ws.close();

          if (response.error) {
            reject(new Error(`CDP error: ${response.error.message}`));
          } else if (response.result) {
            resolve(response.result);
          } else {
            resolve(response);
          }
        } catch (e) {
          if (timeout) clearTimeout(timeout);
          if (ws) ws.close();
          reject(e);
        }
      });

      ws.on("close", () => {
        console.log("[CDP] WebSocket closed");
        if (timeout) clearTimeout(timeout);
      });
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      if (ws) ws.close();
      reject(error);
    }
  });
}
