"use client";

import { useEffect, useState } from "react";

/**
 * Countdown lockout for "resend code" buttons. `start()` arms it for
 * `seconds`; `remaining` ticks down to 0. The timeout chain cleans itself up
 * on unmount (each tick's cleanup clears the pending timeout).
 */
export function useCooldown(seconds = 30) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  return {
    remaining,
    active: remaining > 0,
    start: () => setRemaining(seconds),
  };
}
