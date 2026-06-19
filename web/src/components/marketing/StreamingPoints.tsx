"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a phase's bullet points as if an agent were typing them out: when the
 * list scrolls into view it streams the characters in, one bullet after the
 * next, with a caret at the writing position. The full text is always present in
 * the layout (the not-yet-typed part is just transparent), so the card never
 * reflows while it types - keeping the effect smooth, never janky. Honours
 * prefers-reduced-motion by showing everything at once.
 */
export function StreamingPoints({ points }: { points: readonly string[] }) {
  const ref = useRef<HTMLUListElement>(null);
  const total = points.reduce((sum, p) => sum + p.length, 0);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  // Begin streaming the first time the list is scrolled into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(total);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setStarted(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -15% 0px", threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [total]);

  // Advance a couple of characters per tick - fast enough to feel live, light
  // enough to never drop a frame.
  useEffect(() => {
    if (!started || count >= total) return;
    const id = setInterval(() => setCount((c) => Math.min(c + 2, total)), 16);
    return () => clearInterval(id);
  }, [started, count, total]);

  let cursor = count; // characters still to distribute across the bullets
  return (
    <ul
      ref={ref}
      className="mt-4 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-ink-soft marker:text-terracotta"
    >
      {points.map((point) => {
        const shown = Math.max(0, Math.min(point.length, cursor));
        cursor -= point.length;
        const typing = shown > 0 && shown < point.length;
        return (
          <li key={point}>
            {point.slice(0, shown)}
            {/* The remainder stays laid out but invisible; a caret marks the
                writing head on the bullet currently being typed. */}
            <span className={`text-transparent ${typing ? "border-l-2 border-terracotta" : ""}`}>
              {point.slice(shown)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
