let rfbLoadPromise: Promise<any> | null = null;

/**
 * Loads noVNC's RFB client (an ES module, self-hosted at /novnc/) via an
 * injected <script type="module">, once per page load - sidesteps Next.js/
 * webpack trying to resolve it as part of the app's own module graph, since
 * it's a plain static asset, not a bundled dependency. Shared by both the
 * admin login view and the CRM Inbox live view, since both open a real VNC
 * connection to a model's browser on the VPS.
 */
export function loadRFB(): Promise<any> {
  if ((window as any).__RFB) return Promise.resolve((window as any).__RFB);
  if (rfbLoadPromise) return rfbLoadPromise;
  rfbLoadPromise = new Promise((resolve, reject) => {
    const onReady = () => {
      window.removeEventListener("__rfbready", onReady);
      resolve((window as any).__RFB);
    };
    window.addEventListener("__rfbready", onReady);
    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `
      import RFB from '/novnc/core/rfb.js';
      window.__RFB = RFB;
      window.dispatchEvent(new Event('__rfbready'));
    `;
    script.onerror = () => reject(new Error("noVNC konnte nicht geladen werden"));
    document.head.appendChild(script);
  });
  return rfbLoadPromise;
}
