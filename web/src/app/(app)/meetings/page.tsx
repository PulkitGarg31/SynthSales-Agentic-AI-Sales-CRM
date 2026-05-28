"use client";

import { useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { MeetingStatus } from "@/lib/api-types";

const statusTone: Record<MeetingStatus, "info" | "ok" | "neutral" | "danger"> = {
  Upcoming: "info",
  Completed: "ok",
  Cancelled: "neutral",
  "No-show": "danger",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MeetingsPage() {
  const { data, loading, error, reload } = useApi(() => api.meetings(), []);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");

  if (loading) return <Loading label="Loading meetings…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const all = data ?? [];
  const upcoming = all.filter((m) => m.status === "Upcoming");
  const history = all.filter((m) => m.status !== "Upcoming");
  const rows = tab === "upcoming" ? upcoming : history;

  return (
    <div>
      <PageHeader title="Meetings" subtitle="Track scheduled meetings, history, notes, and join links." />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Upcoming" value={upcoming.length} tone="info" />
        <Stat label="Completed" value={all.filter((m) => m.status === "Completed").length} tone="ok" />
        <Stat label="No-shows" value={all.filter((m) => m.status === "No-show").length} tone="danger" />
      </div>

      <div className="mb-4 flex gap-2">
        {(["upcoming", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${
              tab === t ? "bg-ink text-white" : "bg-surface text-ink-500 ring-1 ring-inset ring-line hover:bg-ink/5"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card className="p-0">
          <div className="px-6 py-12 text-center text-sm text-ink-500">No {tab} meetings.</div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/25 text-ink">
                    <Icon.Calendar width={18} height={18} />
                  </span>
                  <div>
                    <p className="font-bold text-ink">{m.company}</p>
                    <p className="text-xs text-ink-500">{m.contact}</p>
                  </div>
                </div>
                <Badge tone={statusTone[m.status]}>{m.status}</Badge>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm text-ink-700">
                <Icon.Calendar width={15} height={15} className="text-ink-300" />
                {fmt(m.scheduled_at)}
              </div>
              {m.notes && (
                <p className="mt-3 rounded-lg bg-peach-soft/70 px-3 py-2 text-sm text-ink-700">{m.notes}</p>
              )}
              <div className="mt-4 flex gap-2">
                {m.status === "Upcoming" && (
                  <Button href={m.link} className="flex-1">
                    <Icon.ArrowUpRight width={15} height={15} /> Join
                  </Button>
                )}
                {m.status === "Upcoming" && (
                  <Button variant="ghost" className="flex-1" onClick={() => api.updateMeeting(m.id, { status: "Completed" }).then(reload)}>
                    <Icon.Check width={15} height={15} /> Mark done
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="Reminders" subtitle="Automated reminders before each meeting" />
        <div className="flex items-center gap-3 p-5 text-sm text-ink-700">
          <Icon.Bell width={18} height={18} className="text-brand-700" />
          Email + in-app reminders sent 24h and 1h before each upcoming meeting.
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "info" | "ok" | "danger" }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        <Badge tone={tone}>•</Badge>
      </div>
      <div className="mt-2 font-display text-4xl text-ink">{value}</div>
    </Card>
  );
}
