"use client";

import { Button } from "./Button";

export function ErrorCard({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl border border-rust/30 bg-rust/5 px-5 py-4 ${className}`}
    >
      <p className="text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
