// Client-side helpers for the read-only demo account. The flag/token primitives
// (isDemo/enterDemo/exitDemo/DemoError) live in api.ts alongside the token; this
// module adds the React hook components use to render demo affordances, plus the
// per-session "already saw the welcome" flag.
import { useSyncExternalStore } from "react";
import { isDemo } from "./api";

// The demo flag never changes within a session (entering/leaving navigates away),
// so there's nothing to subscribe to — a no-op unsubscribe satisfies the store API.
const noopSubscribe = () => () => {};

/**
 * Reactive `isDemo()` for components. Uses useSyncExternalStore so the server
 * snapshot is always false and the client reads localStorage — no hydration
 * mismatch, no setState-in-effect.
 */
export function useDemo(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => isDemo(),
    () => false,
  );
}

const WELCOME_KEY = "synthsales_demo_welcomed";

export function demoWelcomed(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(WELCOME_KEY) === "1";
}

export function markDemoWelcomed() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(WELCOME_KEY, "1");
}
