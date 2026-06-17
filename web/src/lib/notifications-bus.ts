/**
 * Tiny client-side signal for local notification mutations (mark-read /
 * mark-all-read). The header Bell and the notifications page each fetch the
 * list independently, so a read on one surface would otherwise leave the
 * other's unread badge stale until a new frame arrives or a hard refresh.
 * Read-actions call `emitNotificationsChanged()`; the Bell subscribes and
 * refetches. The signal carries no payload - subscribers re-read from REST
 * (the Bell pattern); it only says "something changed".
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to local notification changes. Returns an unsubscribe function. */
export function onNotificationsChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Signal that notifications changed locally (e.g. marked read). */
export function emitNotificationsChanged(): void {
  // Per-listener isolation: one throwing listener must not starve the rest.
  listeners.forEach((l) => {
    try {
      l();
    } catch (err) {
      console.error("notifications listener failed", err);
    }
  });
}
