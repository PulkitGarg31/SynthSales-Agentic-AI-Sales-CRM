"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Inbox,
  Megaphone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { wsSubscribe } from "@/lib/ws";
import type { AppNotification, NotificationType } from "@/lib/api-types";
import { Button } from "@/components/ui/Button";
import { Chips } from "@/components/ui/Chips";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";

// ---- helpers ---------------------------------------------------------------

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  campaign: Megaphone,
  reply: Inbox,
  meeting: CalendarClock,
  followup: Clock,
  verification: ShieldCheck,
  error: AlertTriangle,
};

const TYPE_OPTIONS = (Object.keys(TYPE_ICON) as NotificationType[]).map((t) => ({
  value: t,
  label: t === "followup" ? "Follow-up" : t[0].toUpperCase() + t.slice(1),
}));

/** "2h ago"-style relative time (module-scope so render stays pure). */
function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---- local components ------------------------------------------------------

function NotificationRow({
  n,
  read,
  onRead,
}: {
  n: AppNotification;
  read: boolean;
  onRead: () => void;
}) {
  const Icon = TYPE_ICON[n.type] ?? Megaphone;
  return (
    <li>
      <button
        type="button"
        onClick={onRead}
        // Read rows are inert - clicking them is a harmless no-op.
        className={`flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors ${
          read ? "cursor-default" : "bg-paper hover:bg-paper/60"
        }`}
      >
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
            n.type === "error" ? "bg-rust/10 text-rust" : "bg-ink/5 text-ink-soft"
          }`}
        >
          <Icon size={15} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm ${read ? "text-ink-soft" : "font-medium text-ink"}`}>
            {n.title}
          </p>
          {n.detail && <p className="mt-0.5 truncate text-xs text-ink-soft">{n.detail}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-xs text-ink-faint">{relTime(n.created_at)}</span>
          {!read && (
            <span aria-label="Unread" className="size-1.5 rounded-full bg-terracotta" />
          )}
        </span>
      </button>
    </li>
  );
}

// ---- page ------------------------------------------------------------------

export default function NotificationsPage() {
  const { data, loading, error, reload } = useApi(() => api.notifications(), []);
  const { busy, run } = useAction();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [types, setTypes] = useState<string[]>([]);
  // Optimistic overlay: ids marked read locally before the server confirms.
  // A later refetch returns them as read anyway, so the set never goes stale.
  const [readIds, setReadIds] = useState<ReadonlySet<number>>(new Set());

  // Notification frames carry no id/read/created_at - refetch the list instead
  // of constructing rows from the frame (the Bell pattern).
  useEffect(
    () =>
      wsSubscribe((e) => {
        if (e.event === "notification") reload();
      }),
    [reload],
  );

  const isRead = (n: AppNotification) => n.read || readIds.has(n.id);

  const markRead = async (n: AppNotification) => {
    if (isRead(n)) return;
    setReadIds((prev) => new Set(prev).add(n.id));
    const r = await run(`read:${n.id}`, () => api.markRead(n.id), { onDone: reload });
    // Failure: roll the optimistic flip back (useAction already toasted).
    if (r === null)
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
  };

  const markAll = () =>
    void run("read-all", api.markAllRead, {
      success: "All notifications marked read",
      onDone: reload,
    });

  const all = data ?? [];
  const unreadCount = all.filter((n) => !isRead(n)).length;
  const toggleType = (value: string) =>
    setTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );

  const rows = all.filter(
    (n) =>
      (tab === "all" || !isRead(n)) &&
      (types.length === 0 || types.includes(n.type)),
  );

  const initialLoad = loading && data === null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Notifications</h1>
        <Button
          variant="secondary"
          busy={busy === "read-all"}
          disabled={unreadCount === 0}
          onClick={markAll}
        >
          Mark all read
        </Button>
      </header>

      {initialLoad ? (
        <SkeletonRows n={6} />
      ) : error ? (
        <ErrorCard message={error} onRetry={reload} />
      ) : all.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          line="Agent activity (replies, meetings, verifications) lands here."
        />
      ) : (
        <>
          <div className="space-y-3">
            <Tabs
              value={tab}
              onChange={(v) => setTab(v as "all" | "unread")}
              items={[
                { value: "all", label: "All", count: all.length },
                { value: "unread", label: "Unread", count: unreadCount },
              ]}
            />
            <Chips options={TYPE_OPTIONS} selected={types} onToggle={toggleType} />
          </div>

          {rows.length === 0 ? (
            <p className="py-10 text-center font-serif italic text-ink-soft">
              Nothing matches this filter.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {rows.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  read={isRead(n)}
                  onRead={() => void markRead(n)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
