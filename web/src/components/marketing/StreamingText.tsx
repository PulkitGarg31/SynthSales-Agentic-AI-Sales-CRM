"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Types a single paragraph out, agent-style, the first time it scrolls into
 * view: reveals the characters with a caret at the writing head. The remainder
 * stays laid out but transparent, so the card never reflows while it types -
 * smooth, never janky. Honours prefers-reduced-motion by showing it all at once.
 */
export function StreamingText({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(text.length);
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
  }, [text]);

  useEffect(() => {
    if (!started || count >= text.length) return;
    const id = setInterval(() => setCount((c) => Math.min(c + 2, text.length)), 16);
    return () => clearInterval(id);
  }, [started, count, text]);

  const typing = count > 0 && count < text.length;
  return (
    <p ref={ref} className={className}>
      {text.slice(0, count)}
      <span className={`text-transparent ${typing ? "border-l-2 border-terracotta" : ""}`}>
        {text.slice(count)}
      </span>
    </p>
  );
}
