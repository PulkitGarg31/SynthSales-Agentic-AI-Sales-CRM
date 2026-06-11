"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { wsSubscribe } from "@/lib/ws";
import { useToast } from "@/components/ui/Toast";
import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * Notification bell: unread count + latest-5 dropdown. This is the shell's
 * single WS subscription — a `notification` frame fires a toast and refetches
 * the list from REST (frames carry no id/read/created_at, so the count is
 * always derived from the API, never constructed from the frame). Opening the
 * dropdown marks nothing read.
 */
export function Bell() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  // One fetch feeds both numbers: unread count = filter, dropdown = newest 5.
  const { data, reload } = useApi(() => api.notifications(), []);

  useEffect(
    () =>
      wsSubscribe((e) => {
        if (e.event !== "notification") return;
        const { type, title, detail } = e.data;
        toast(detail ? `${title} — ${detail}` : title, type === "error" ? "error" : "success");
        reload(); // refetch count + list; the frame has no row to merge locally
      }),
    [toast, reload],
  );

  // Escape closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const unread = data?.filter((n) => !n.read).length ?? 0;
  const latest = data?.slice(0, 5) ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-ink-soft transition-colors hover:bg-paper hover:text-ink"
      >
        <BellIcon size={18} strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-semibold text-cream">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-line bg-paper py-2 shadow-lg">
            <div className="px-4 py-1.5">
              <Eyebrow>Notifications</Eyebrow>
            </div>
            {latest.length === 0 ? (
              <p className="px-4 py-3 font-serif italic text-sm text-ink-soft">
                Nothing yet — agent activity will land here.
              </p>
            ) : (
              <ul>
                {latest.map((n) => (
                  <li key={n.id} className="flex gap-2.5 px-4 py-2.5">
                    <span
                      aria-hidden
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        n.read ? "bg-line" : "bg-terracotta"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${n.read ? "text-ink-soft" : "font-medium text-ink"}`}>
                        {n.title}
                      </p>
                      {n.detail && <p className="truncate text-xs text-ink-soft">{n.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 border-t border-line px-4 pt-2">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-terracotta hover:underline"
              >
                View all →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
