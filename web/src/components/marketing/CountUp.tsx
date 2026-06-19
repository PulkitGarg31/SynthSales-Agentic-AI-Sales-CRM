"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a number up from zero to its target the first time it scrolls into view
 * (ease-out over ~1.1s), then holds. Parses the digits out of the source string
 * and re-formats with thousands separators, so "3,071" animates up to "3,071".
 * tabular-nums keeps the digits from jittering as they roll. Honours
 * prefers-reduced-motion by showing the final value immediately.
 */
export function CountUp({ value, className = "" }: { value: string; className?: string }) {
  const target = parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
  const ref = useRef<HTMLParagraphElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    let interval = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          observer.disconnect();
          const totalTicks = 70; // ~1.1s at 16ms per tick
          let tick = 0;
          interval = window.setInterval(() => {
            tick += 1;
            const p = Math.min(tick / totalTicks, 1);
            const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
            setN(Math.round(eased * target));
            if (p >= 1) window.clearInterval(interval);
          }, 16);
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [target]);

  return (
    <p ref={ref} className={`tabular-nums ${className}`}>
      {n.toLocaleString("en-US")}
    </p>
  );
}
