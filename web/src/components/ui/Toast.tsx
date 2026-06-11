"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Kind = "success" | "error";
type ToastItem = { id: number; message: string; kind: Kind };

const ToastContext = createContext<{ toast: (message: string, kind?: Kind) => void } | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Clear all pending dismiss timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const toast = useCallback((message: string, kind: Kind = "success") => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, message, kind }].slice(-4)); // max 4 visible
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 4000),
    );
  }, []);

  // Stable context value: consumers must not re-render on every toast change.
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl bg-ink px-4 py-3 text-sm text-cream border-l-4 ${
              t.kind === "error" ? "border-rust" : "border-moss"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
