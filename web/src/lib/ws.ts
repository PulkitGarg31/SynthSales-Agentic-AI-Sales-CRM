import { API_URL, getToken } from "./api";

export type WsEvent =
  | { event: "log"; data: { category: string; message: string; level: string } }
  | { event: "notification"; data: { type: string; title: string; detail: string } };

type Listener = (e: WsEvent) => void;

let socket: WebSocket | null = null;
const listeners = new Set<Listener>();
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Subscribe to backend realtime events. Returns an unsubscribe function. */
export function wsSubscribe(fn: Listener): () => void {
  listeners.add(fn);
  ensure();
  return () => {
    listeners.delete(fn);
  };
}

function ensure() {
  if (typeof window === "undefined") return; // SSR: never open a socket
  if (socket && socket.readyState <= WebSocket.OPEN) return; // CONNECTING or OPEN
  const token = getToken();
  if (!token) return;

  socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`);
  socket.onopen = () => {
    attempt = 0;
  };
  socket.onmessage = (m) => {
    try {
      const e = JSON.parse(m.data) as WsEvent;
      listeners.forEach((l) => l(e));
    } catch {
      /* ignore malformed frames */
    }
  };
  socket.onclose = () => {
    socket = null;
    if (listeners.size === 0) return; // nobody cares — stay disconnected
    const delay = Math.min(30_000, 1000 * 2 ** attempt++); // capped exponential backoff
    reconnectTimer = setTimeout(ensure, delay);
  };
}

/** Tear everything down (sign-out): listeners, pending reconnects, the socket. */
export function wsDisconnect() {
  listeners.clear();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.onclose = null; // don't let the close handler schedule a reconnect
    socket.close();
    socket = null;
  }
  attempt = 0;
}
