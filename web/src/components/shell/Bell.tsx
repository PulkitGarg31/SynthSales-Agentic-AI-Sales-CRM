"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell as BellIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { AppNotification } from "@/lib/api-types";
import { useApi, useAction } from "@/lib/hooks";
import { onNotificationsChanged, emitNotificationsChanged } from "@/lib/notifications-bus";
import { useToast } from "@/components/ui/Toast";
import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * Notification bell: unread count + latest-5 dropdown. This is the shell's
 * single WS subscription - a `notification` frame fires a toast and refetches
 * the list from REST (frames carry no id/read/created_at, so the count is
 * always derived from the API, never constructed from the frame). Clicking an
 * unread row marks it read (optimistic) and emits on the notifications bus so
 * this bell and an open notifications page stay in sync.
 */
export function Bell() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { run } = useAction();
  // Optimistic overlay: ids marked read locally before the server confirms
  // (mirrors the notifications page); a later refetch returns them read anyway.
  const [readIds, setReadIds] = useState<ReadonlySet<number>>(new Set());

  // Close on route change - the shell persists across navigation.
  const pathname = usePathname();
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }
  // One fetch feeds both numbers: unread count = filter, dropdown = newest 5.
  // Polls every 30s (replaces the old WS push); the window-focus refetch below
  // catches updates the moment the user returns to the tab.
  const { data, reload } = useApi(() => api.notifications(), [], 30_000);

  // Toast notifications newer than the last batch we saw. The first load only
  // primes the high-water mark, so the existing backlog never toasts.
  const seenIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    const maxId = data.reduce((m, n) => Math.max(m, n.id), 0);
    if (seenIdRef.current === null) {
      seenIdRef.current = maxId;
      return;
    }
    if (maxId > seenIdRef.current) {
      const cutoff = seenIdRef.current;
      seenIdRef.current = maxId;
      // Oldest-first so the newest notification is the last toast shown.
      data
        .filter((n) => n.id > cutoff)
        .reverse()
        .forEach((n) =>
          toast(
            n.detail ? `${n.title} · ${n.detail}` : n.title,
            n.type === "error" ? "error" : "success",
          ),
        );
    }
  }, [data, toast]);

  // Read-actions (mark read / mark all) happen on the notifications page, which
  // fetches separately - subscribe so this badge re-syncs the moment they fire.
  useEffect(() => onNotificationsChanged(reload), [reload]);

  // Re-sync when the user returns to the tab/window: catches reads made while
  // away and notifications created while the socket was idle.
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  // Escape closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isRead = (n: AppNotification) => n.read || readIds.has(n.id);

  const markRead = async (n: AppNotification) => {
    if (isRead(n)) return;
    setReadIds((prev) => new Set(prev).add(n.id));
    // onDone fires only on success; the bus refetches both this bell and an
    // open notifications page. Failure rolls the optimistic flip back.
    const r = await run(`read:${n.id}`, () => api.markRead(n.id), {
      onDone: emitNotificationsChanged,
    });
    if (r === null)
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
  };

  const unread = data?.filter((n) => !isRead(n)).length ?? 0;
  const latest = data?.slice(0, 5) ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-haspopup="menu"
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
                Nothing yet. Agent activity will land here.
              </p>
            ) : (
              <ul>
                {latest.map((n) => {
                  const read = isRead(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void markRead(n)}
                        aria-label={read ? n.title : `Mark "${n.title}" read`}
                        className={`flex w-full gap-2.5 px-4 py-2.5 text-left transition-colors ${
                          read ? "cursor-default" : "hover:bg-ink/5"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            read ? "bg-line" : "bg-terracotta"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className={`truncate text-sm ${read ? "text-ink-soft" : "font-medium text-ink"}`}>
                            {n.title}
                          </p>
                          {n.detail && <p className="truncate text-xs text-ink-soft">{n.detail}</p>}
                        </div>
                      </button>
                    </li>
                  );
                })}
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
