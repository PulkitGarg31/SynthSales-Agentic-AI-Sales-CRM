"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, DemoError } from "./api";
import { useToast } from "@/components/ui/Toast";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Runs an async API call on mount (and when `deps` change). Pass `pollMs` to
 * also re-run on an interval — used in place of realtime push for lists that
 * should stay fresh (notifications, activity log). `null`/0 disables polling.
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  pollMs: number | null = null,
): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Caller-supplied dep array by design (mirrors useEffect's contract).
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const memoFn = useCallback(fn, deps);

  useEffect(() => {
    let active = true;
    // Deliberate: re-entering the loading state when deps change is the hook's
    // contract; the fetch itself resolves asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    memoFn()
      .then((d) => active && setData(d))
      .catch((e) => {
        if (!active) return;
        setError(e instanceof ApiError ? e.message : "Something went wrong");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [memoFn, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Optional polling: a positive pollMs re-runs the fetch on that cadence;
  // null/0 disables. Self-clears on unmount or when the cadence changes.
  useEffect(() => {
    if (!pollMs || pollMs <= 0) return;
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [pollMs, reload]);

  return { data, loading, error, reload };
}

/**
 * The one mutation pattern every button uses: run an async action keyed by a
 * string, expose which key is in flight (`busy`) so each button on a screen
 * can show its own spinner, toast success/failure, and never throw.
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  // Sequence guard: when runs overlap, only the LATEST one may clear `busy`,
  // so an earlier run's finally can't re-enable a button still in flight.
  const seq = useRef(0);

  const run = useCallback(
    async function run<T>(
      key: string,
      fn: () => Promise<T>,
      opts?: { success?: string | ((r: T) => string); onDone?: (r: T) => void },
    ): Promise<T | null> {
      const id = ++seq.current;
      setBusy(key);
      try {
        const r = await fn();
        if (opts?.success) {
          toast(typeof opts.success === "function" ? opts.success(r) : opts.success, "success");
        }
        opts?.onDone?.(r);
        return r;
      } catch (e) {
        // Demo mode: every mutation is inert — nudge toward a real account.
        if (e instanceof DemoError) {
          toast("This is a demo — create an account to run this for real.");
          return null;
        }
        // Access-required 403s are handled by the global AccessRequiredModal.
        if (e instanceof ApiError && e.accessRequired) return null;
        toast(e instanceof ApiError ? e.message : "Something went wrong. Try again.", "error");
        return null;
      } finally {
        if (seq.current === id) setBusy(null);
      }
    },
    [toast],
  );

  return { busy, run };
}
