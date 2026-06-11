"use client";

import { useRef } from "react";

const LEN = 6;

/**
 * Six segmented one-time-code boxes over a single controlled string value
 * (contiguous digits, typed left-to-right). Typing auto-advances, pasting a
 * 6-digit string splits across the boxes, Backspace on an empty box retreats
 * and deletes the previous digit. Only digits are accepted.
 */
export function OtpInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focusBox = (i: number) =>
    refs.current[Math.max(0, Math.min(LEN - 1, i))]?.focus();

  const apply = (next: string, focusIndex: number) => {
    onChange(next.slice(0, LEN));
    focusBox(focusIndex);
  };

  // Covers single keystrokes, multi-digit autofill ("one-time-code"), and any
  // paste the onPaste handler didn't intercept: overwrite at box i, PRESERVING
  // the tail so retyping one wrong digit mid-code doesn't wipe the rest.
  const handleInput = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return; // non-digit input — controlled re-render restores the box
    const next = (value.slice(0, i) + digits + value.slice(i + digits.length)).slice(0, LEN);
    apply(next, i + digits.length);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        apply(value.slice(0, i) + value.slice(i + 1), i);
      } else if (i > 0) {
        apply(value.slice(0, i - 1) + value.slice(i), i - 1);
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight" && i < LEN - 1) {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    const next = (value.slice(0, i) + digits + value.slice(i + digits.length)).slice(0, LEN);
    apply(next, i + digits.length);
  };

  return (
    <div role="group" aria-label="Verification code" className="flex gap-2">
      {Array.from({ length: LEN }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          // Select on focus so typing over a filled box replaces its digit.
          onFocus={(e) => e.currentTarget.select()}
          className="h-12 w-10 rounded-lg border border-line bg-paper text-center font-mono text-lg text-ink focus:outline-none focus:ring-2 focus:ring-ink/60 disabled:opacity-50"
        />
      ))}
    </div>
  );
}

/** Dev-mode callout for the `dev_otp` the backend returns in console email mode. */
export function DevOtpNote({ code, onFill }: { code: string; onFill?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-cream">
      <p className="text-xs">
        Console mode — your code:{" "}
        <span className="font-mono text-sm tracking-widest">{code}</span>
      </p>
      {onFill && (
        <button
          type="button"
          onClick={onFill}
          className="shrink-0 rounded-full border border-cream/30 px-3 py-1 text-xs font-medium transition hover:bg-cream/10"
        >
          Auto-fill
        </button>
      )}
    </div>
  );
}
