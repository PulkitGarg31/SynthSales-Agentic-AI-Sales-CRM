"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { wsSubscribe } from "@/lib/ws";
import { useAuth } from "@/components/AuthProvider";
import type { FunnelStage, Meeting } from "@/lib/api-types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { StatNumeral } from "@/components/ui/StatNumeral";

// ---- helpers ---------------------------------------------------------------

function greetingForHour(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function warmingLine(replies: number | undefined): string {
  if (replies === undefined) return "Here's where things stand.";
  if (replies === 0) return "No conversations warming yet.";
  if (replies === 1) return "One conversation warming.";
  return `${replies} conversations warming.`;
}

/** HH:MM:SS for the mono activity timestamps. */
function timeHMS(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

function meetingWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// One unified row shape for fetched logs and live WS frames (which carry no
// timestamp — we stamp them with client receive time).
interface ActivityItem {
  key: string;
  time: Date;
  category: string;
  message: string;
  level: string;
}

const LEVEL_DOT: Record<string, string> = {
  info: "bg-moss",
  warn: "bg-amber",
  error: "bg-rust",
};

// Cream→terracotta progression by stage index — on-palette opacity steps only.
const FUNNEL_TONES = [
  "bg-ink/10",
  "bg-ink/25",
  "bg-terracotta/40",
  "bg-terracotta/70",
  "bg-terracotta",
];

// ---- local components ------------------------------------------------------

function FunnelBar({ stages }: { stages: FunnelStage[] }) {
  const total = stages.reduce((s, f) => s + f.value, 0);
  return (
    <div className="space-y-4">
      <div className="flex h-3 gap-1">
        {stages.map((f, i) => (
          <div
            key={f.label}
            className={`basis-0 rounded-full ${FUNNEL_TONES[i % FUNNEL_TONES.length]}`}
            // Proportional split with a 2% floor so zero-value stages stay visible.
            style={{ flexGrow: total > 0 ? Math.max(f.value, total * 0.02) : 1 }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {stages.map((f, i) => (
          <div key={f.label} className="flex items-baseline gap-2">
            <span
              aria-hidden
              className={`size-2 shrink-0 self-center rounded-full ${FUNNEL_TONES[i % FUNNEL_TONES.length]}`}
            />
            <Eyebrow>{f.label}</Eyebrow>
            <span className="font-serif text-lg leading-none text-ink">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <li className="flex items-baseline gap-3 px-5 py-2.5">
      <span
        aria-hidden
        className={`size-1.5 shrink-0 self-center rounded-full ${LEVEL_DOT[item.level] ?? "bg-ink/20"}`}
      />
      <span className="font-mono text-xs text-ink-faint">{timeHMS(item.time)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{item.message}</span>
      <Badge>{item.category}</Badge>
    </li>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{meeting.company}</p>
        <p className="truncate text-xs text-ink-soft">
          {meeting.contact} · {meetingWhen(meeting.scheduled_at)}
        </p>
      </div>
      {meeting.link && (
        <a
          href={meeting.link}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-sm font-medium text-terracotta hover:underline"
        >
          Join
        </a>
      )}
    </li>
  );
}

// ---- page ------------------------------------------------------------------

export default function DashboardPage() {
  const { me } = useAuth();
  const router = useRouter();

  const dash = useApi(api.dashboard);
  const meetings = useApi(() => api.meetings("Upcoming"));
  const logs = useApi(() => api.logs("All", 8));

  // Live-appended log rows from the WS hub, newest first, capped at 8.
  const [live, setLive] = useState<ActivityItem[]>([]);
  const seq = useRef(0);
  useEffect(
    () =>
      wsSubscribe((e) => {
        if (e.event !== "log") return;
        const row: ActivityItem = {
          key: `live-${++seq.current}`,
          time: new Date(),
          category: e.data.category,
          message: e.data.message,
          level: e.data.level,
        };
        setLive((prev) => [row, ...prev].slice(0, 8));
      }),
    []
  );

  const activity: ActivityItem[] = [
    ...live,
    ...(logs.data ?? []).map((l) => ({
      key: `log-${l.id}`,
      time: new Date(l.created_at),
      category: l.category as string,
      message: l.message,
      level: l.level as string,
    })),
  ].slice(0, 8);

  // Page-load timestamp: stable across re-renders (and keeps render pure).
  // "Future" only needs to be right relative to when the user opened the page.
  const [now] = useState(() => Date.now());
  const upcoming = (meetings.data ?? [])
    .filter((m) => new Date(m.scheduled_at).getTime() >= now)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 5);

  const firstName = me.name.split(" ")[0] || me.name;
  const firstRun = dash.data !== null && dash.data.companies_uploaded === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting band */}
      <header>
        <h1 className="display text-3xl sm:text-4xl">
          {greetingForHour(new Date().getHours())}, {firstName}.
        </h1>
        <p className="mt-2 font-serif text-lg italic text-ink-soft">
          {warmingLine(dash.data?.replies_received)}
        </p>
      </header>

      {firstRun ? (
        <EmptyState
          title="Welcome to Sellari"
          line="Upload a list. The agents do the rest."
          action={
            <Button onClick={() => router.push("/campaigns/new")}>
              Start a campaign
            </Button>
          }
        />
      ) : (
        <>
          {/* Stats + funnel — own the dashboard call's state */}
          {dash.loading ? (
            <SkeletonRows n={3} />
          ) : dash.error ? (
            <ErrorCard message={dash.error} onRetry={dash.reload} />
          ) : dash.data ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Card>
                  <StatNumeral value={dash.data.active_campaigns} label="Active campaigns" />
                </Card>
                <Card>
                  <StatNumeral value={dash.data.companies_uploaded} label="Companies uploaded" />
                </Card>
                <Card>
                  <StatNumeral value={dash.data.emails_sent} label="Emails sent" />
                </Card>
                <Card>
                  <StatNumeral value={dash.data.replies_received} label="Replies" />
                </Card>
                <Card>
                  <StatNumeral value={dash.data.meetings_booked} label="Meetings booked" />
                </Card>
              </div>

              <Card title="Pipeline funnel">
                <FunnelBar stages={dash.data.funnel} />
              </Card>
            </>
          ) : null}

          {/* Two columns: activity | upcoming meetings — each independent */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Activity" flush>
              <div className="mt-3 pb-2">
                {logs.loading ? (
                  <div className="px-5 pb-3">
                    <SkeletonRows n={4} />
                  </div>
                ) : logs.error ? (
                  <div className="px-5 pb-3">
                    <ErrorCard
                      message={logs.error}
                      onRetry={() => {
                        // Drop live rows too, or a retried fetch would re-list
                        // messages that already arrived over the socket.
                        setLive([]);
                        logs.reload();
                      }}
                    />
                  </div>
                ) : activity.length === 0 ? (
                  <p className="px-5 pb-3 font-serif italic text-ink-soft">
                    Quiet so far. Agents will report here.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {activity.map((item) => (
                      <ActivityRow key={item.key} item={item} />
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            <Card title="Upcoming meetings" flush>
              <div className="mt-3 pb-2">
                {meetings.loading ? (
                  <div className="px-5 pb-3">
                    <SkeletonRows n={3} />
                  </div>
                ) : meetings.error ? (
                  <div className="px-5 pb-3">
                    <ErrorCard message={meetings.error} onRetry={meetings.reload} />
                  </div>
                ) : upcoming.length === 0 ? (
                  <p className="px-5 pb-3 font-serif italic text-ink-soft">
                    Nothing on the calendar yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {upcoming.map((m) => (
                      <MeetingRow key={m.id} meeting={m} />
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
