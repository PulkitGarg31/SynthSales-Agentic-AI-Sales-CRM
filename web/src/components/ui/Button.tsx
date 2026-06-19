"use client";

import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-ink text-cream hover:opacity-90",
  secondary:
    "border border-line bg-transparent text-ink hover:border-terracotta hover:bg-terracotta/10 hover:text-terracotta",
  ghost: "text-ink-soft hover:text-ink",
  accent: "bg-terracotta text-cream hover:opacity-90",
  danger: "bg-rust text-cream hover:opacity-90",
};

export function Button({
  variant = "primary",
  busy = false,
  disabled,
  className = "",
  children,
  ...rest
}: React.ComponentProps<"button"> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none ${styles[variant]} ${className}`}
      // `disabled` is destructured out of rest so the spread can't override the busy lockout.
      disabled={busy || disabled}
      aria-busy={busy}
      {...rest}
    >
      {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
