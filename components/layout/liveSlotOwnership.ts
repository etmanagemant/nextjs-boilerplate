// Coordinates which browser tab currently "owns" the live VNC connection
// for a given (chatter, model) pair, so opening a model in a new tab moves
// the connection there instead of running two simultaneous VNC streams to
// the same slot (real, avoidable server-side cost - x11vnc has to encode
// and push frames to every connected viewer). Two tabs of the SAME chatter
// only, coordinated via BroadcastChannel (instant, same-origin) plus a
// localStorage flag (so a freshly-loaded/refreshed tab immediately knows
// whether a popout is already active, without needing to wait for a
// message it could never have received before it existed).
export type OwnershipMessage =
  | { type: "claim"; modelId: string }
  | { type: "release"; modelId: string }
  | { type: "request-release"; modelId: string };

export function ownerFlagKey(chatterId: string, modelId: string): string {
  return `live-popout-owner:${chatterId}:${modelId}`;
}

export function ownershipChannelName(chatterId: string): string {
  return `live-popout:${chatterId}`;
}

export function openOwnershipChannel(chatterId: string): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  return new BroadcastChannel(ownershipChannelName(chatterId));
}
