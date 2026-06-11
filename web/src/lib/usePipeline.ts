"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { PipelineAgent } from "./api-types";

/**
 * Fetches a campaign's pipeline and polls it every 3s while any agent is
 * Running. `watch()` is idempotent (one interval at most) and the interval
 * self-stops once everything is idle. Call `watch()` after starting a run.
 */
export function usePipeline(campaignId: number) {
  const [agents, setAgents] = useState<PipelineAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards watch() calls that land after unmount (e.g. an action's onDone
  // resolving post-navigation) — they must not start a leaked interval.
  const alive = useRef(true);

  const load = useCallback(async (): Promise<boolean> => {
    const data = await api.campaignPipeline(campaignId);
    setAgents(data);
    setError(null);
    return data.some((a) => a.status === "Running");
  }, [campaignId]);

  const watch = useCallback(() => {
    if (!alive.current || timer.current) return;
    timer.current = setInterval(async () => {
      const running = await load().catch(() => false);
      if (!running && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }, 3000);
  }, [load]);

  useEffect(() => {
    alive.current = true;
    // Deliberate (same contract as useApi): `load` only sets state after its
    // fetch resolves — nothing here sets state synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .then((running) => running && watch())
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Something went wrong"),
      );
    return () => {
      alive.current = false;
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [load, watch]);

  return { agents, error, refresh: load, watch };
}
