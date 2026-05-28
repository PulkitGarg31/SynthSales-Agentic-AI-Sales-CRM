"use client";

import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { AppNotification, NotificationType } from "@/lib/api-types";

const meta: Record<NotificationType, { icon: keyof typeof Icon; tone: "info" | "ok" | "warn" | "danger" | "brand" | "neutral" }> = {
  reply: { icon: "Chat", tone: "info" },
  meeting: { icon: "Calendar", tone: "ok" },
  verification: { icon: "Mail", tone: "warn" },
  campaign: { icon: "Campaign", tone: "brand" },
  followup: { icon: "Mail", tone: "neutral" },
  error: { icon: "Info", tone: "danger" },
};

function time(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NotificationsPage() {
  const { data, loading, error, reload } = useApi(() => api.notifications(), []);
  const [list, setList] = useState<AppNotification[] | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  if (loading) return <Loading label="Loading notifications…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const items = list ?? data ?? [];
  const visible = items.filter((n) => filter === "all" || !n.read);

  async function markAll() {
    await api.markAllRead();
    setList(items.map((n) => ({ ...n, read: true })));
  }
  async function markOne(id: number) {
    await api.markRead(id);
    setList(items.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="Real-time updates across your campaigns."
        actions={
          <Button variant="ghost" onClick={markAll}>
            <Icon.Check width={16} height={16} /> Mark all read
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${
              filter === f ? "bg-ink text-white" : "bg-surface text-ink-500 ring-1 ring-inset ring-line hover:bg-ink/5"
            }`}
          >
            {f}
            {f === "unread" && <span className="ml-1.5 text-xs">{items.filter((n) => !n.read).length}</span>}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-ink-500">Nothing here.</div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((n) => {
              const m = meta[n.type] ?? meta.campaign;
              const NIcon = Icon[m.icon];
              return (
                <li key={n.id} className={`flex gap-3 px-5 py-4 ${n.read ? "" : "bg-brand/5"}`}>
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink">
                    <NIcon width={17} height={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink">{n.title}</p>
                      <Badge tone={m.tone}>{n.type}</Badge>
                    </div>
                    <p className="text-sm text-ink-500">{n.detail}</p>
                    <p className="mt-0.5 text-xs text-ink-300">{time(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <button onClick={() => markOne(n.id)} className="self-center rounded-full p-2 text-ink-300 hover:bg-ink/5 hover:text-ink" title="Mark as read">
                      <Icon.Check width={16} height={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
