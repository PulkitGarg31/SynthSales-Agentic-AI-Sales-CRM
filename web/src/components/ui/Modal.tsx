"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

// Renders inline (no portal): ancestors must never gain transform/filter, or
// the fixed overlay re-anchors to them.
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // While open: Escape closes, focus moves into the panel (restored to the
  // trigger on close), and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      // mousedown, not click: a text-selection drag that ends on the overlay
      // must not close the modal.
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-paper p-6 focus:outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="display text-xl mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  destructive = false,
  typedPhrase,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  typedPhrase?: string;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  // A stale typed phrase must not pre-unlock the next open. Adjust-during-render
  // (the React-docs pattern) instead of an effect: no extra commit, lint-clean.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setTyped("");
  }

  const blocked = !!typedPhrase && typed !== typedPhrase;
  // Escape/overlay/Cancel must not dismiss mid-flight - the action completes
  // anyway, and a vanished dialog would read as "cancelled".
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal open={open} onClose={close} title={title}>
      <div className="text-sm text-ink-soft space-y-3">{body}</div>
      {typedPhrase && (
        <input
          className="mt-3 w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rust/60"
          placeholder={`Type "${typedPhrase}" to confirm`}
          aria-label={`Type "${typedPhrase}" to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          variant={destructive ? "danger" : "accent"}
          busy={busy}
          disabled={blocked}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch {
              // Swallow: the modal staying open signals failure; the caller's
              // onConfirm (e.g. useAction) is responsible for surfacing it.
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
