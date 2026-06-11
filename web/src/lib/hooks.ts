"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { useToast } from "@/components/ui/Toast";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Runs an async API call on mount (and when `deps` change). */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
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

  async function run<T>(
    key: string,
    fn: () => Promise<T>,
    opts?: { success?: string | ((r: T) => string); onDone?: (r: T) => void },
  ): Promise<T | null> {
    setBusy(key);
    try {
      const r = await fn();
      if (opts?.success) {
        toast(typeof opts.success === "function" ? opts.success(r) : opts.success, "success");
      }
      opts?.onDone?.(r);
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong. Try again.", "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return { busy, run };
}
