"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { TourStep } from "@/lib/onboarding";

const LG_BREAKPOINT = 1024; // Tailwind `lg` — below this the sidebar is a sheet.
const TIP_W = 320;
const MARGIN = 12;

type Rect = { top: number; left: number; width: number; height: number };

function findVisibleTarget(tourId: string): HTMLElement | null {
  const els = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${tourId}"]`),
  );
  // The sidebar renders twice (desktop column + mobile sheet); pick the one that
  // is actually laid out (non-zero box, attached to the render tree).
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && el.offsetParent !== null) return el;
  }
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Tooltip top-left, chosen from the preferred side then flipped to fit. */
function placeTooltip(
  rect: Rect | null,
  placement: TourStep["placement"],
  tipH: number,
): { top: number; left: number; centered: boolean } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tipW = Math.min(TIP_W, vw - 2 * MARGIN);
  if (!rect) {
    return {
      top: Math.max(MARGIN, (vh - tipH) / 2),
      left: Math.max(MARGIN, (vw - tipW) / 2),
      centered: true,
    };
  }
  const clampH = (l: number) => Math.min(Math.max(MARGIN, l), vw - tipW - MARGIN);
  const clampV = (t: number) => Math.min(Math.max(MARGIN, t), vh - tipH - MARGIN);

  const fitsRight = rect.left + rect.width + MARGIN + tipW <= vw - MARGIN;
  const fitsLeft = rect.left - MARGIN - tipW >= MARGIN;
  const fitsBottom = rect.top + rect.height + MARGIN + tipH <= vh - MARGIN;
  const fitsTop = rect.top - MARGIN - tipH >= MARGIN;

  const order = [placement ?? "bottom", "bottom", "right", "top", "left"];
  for (const p of order) {
    if (p === "right" && fitsRight)
      return { top: clampV(rect.top), left: rect.left + rect.width + MARGIN, centered: false };
    if (p === "left" && fitsLeft)
      return { top: clampV(rect.top), left: rect.left - MARGIN - tipW, centered: false };
    if (p === "bottom" && fitsBottom)
      return { top: rect.top + rect.height + MARGIN, left: clampH(rect.left), centered: false };
    if (p === "top" && fitsTop)
      return { top: rect.top - MARGIN - tipH, left: clampH(rect.left), centered: false };
  }
  // Nothing fits beside the target (small screen) — sit at the bottom, clamped.
  return { top: clampV(vh - tipH - MARGIN), left: clampH(rect.left), centered: false };
}

export function OnboardingTour({
  steps,
  onFinish,
  onOpenNav,
  onCloseNav,
}: {
  steps: TourStep[];
  onFinish: () => void;
  onOpenNav: () => void;
  onCloseNav: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; centered: boolean } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const isMobile = () => window.innerWidth < LG_BREAKPOINT;

  const measure = useCallback(() => {
    const el = findVisibleTarget(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // Bring the target into view if it's scrolled off.
    if (r.top < MARGIN || r.bottom > window.innerHeight - MARGIN) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    const r2 = el.getBoundingClientRect();
    setRect({ top: r2.top, left: r2.left, width: r2.width, height: r2.height });
  }, [step.target]);

  // On each step: open/close the mobile nav sheet as needed, then measure (with a
  // few retries so a just-opened sheet has time to lay out).
  useEffect(() => {
    if (step.sidebar && isMobile()) onOpenNav();
    else onCloseNav();

    let frame = 0;
    let tries = 0;
    const tick = () => {
      measure();
      if (++tries < 12) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, step.sidebar, measure, onOpenNav, onCloseNav]);

  // Keep the spotlight glued to the target as the layout shifts.
  useEffect(() => {
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true); // capture inner scrollers too
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [measure]);

  // Recompute tooltip position after the card (and rect) are known.
  useLayoutEffect(() => {
    const tipH = cardRef.current?.offsetHeight ?? 200;
    setPos(placeTooltip(rect, step.placement, tipH));
  }, [rect, step.placement, index]);

  const finish = useCallback(() => {
    onCloseNav();
    onFinish();
  }, [onCloseNav, onFinish]);

  const next = useCallback(() => {
    if (index < steps.length - 1) setIndex((i) => i + 1);
    else finish();
  }, [index, steps.length, finish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, next, back]);

  const pad = 6;
  const spot = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Click-catcher: blocks interaction with the page behind the tour. */}
      <div className="absolute inset-0" aria-hidden />

      {/* Spotlight (or a full dim when there's no on-screen target). */}
      {spot ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-terracotta transition-all duration-200"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(20, 18, 15, 0.55)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-ink/55" />
      )}

      {/* Tooltip card */}
      <div
        ref={cardRef}
        className="absolute w-[320px] max-w-[calc(100vw-24px)] max-h-[80vh] overflow-auto rounded-2xl border border-line bg-paper p-5 shadow-2xl"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            Step {index + 1} of {steps.length}
          </p>
          <button
            type="button"
            onClick={finish}
            aria-label="Skip tour"
            className="-mr-1 -mt-1 rounded-full p-1 text-ink-faint transition-colors hover:bg-cream hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <h2 className="mt-2 font-serif text-xl italic leading-tight text-ink">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-terracotta" : "w-1.5 bg-ink/15"
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-xs font-medium text-ink-faint transition-colors hover:text-ink"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-cream"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-cream transition-opacity hover:opacity-90"
            >
              {index === steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
