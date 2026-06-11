"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";

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
  // Escape closes. Listener only lives while the modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-line bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
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

  // A stale typed phrase must not pre-unlock the next open.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const blocked = !!typedPhrase && typed !== typedPhrase;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-ink-soft space-y-3">{body}</div>
      {typedPhrase && (
        <input
          className="mt-3 w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rust/60"
          placeholder={`Type "${typedPhrase}" to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
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
