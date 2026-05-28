"use client";

import { Badge, Button, Card, CardHeader, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Campaign, CampaignStatus } from "@/lib/api-types";

const metricDefs = [
  { key: "companies_uploaded", label: "Companies uploaded", icon: "Upload" as const },
  { key: "companies_researched", label: "Companies researched", icon: "Research" as const },
  { key: "emails_sent", label: "Emails sent", icon: "Mail" as const },
  { key: "replies_received", label: "Replies received", icon: "Chat" as const },
  { key: "meetings_booked", label: "Meetings booked", icon: "Calendar" as const },
] as const;

const logIcon: Record<string, keyof typeof Icon> = {
  Email: "Mail",
  AI: "Bot",
  Campaign: "Campaign",
  Verification: "Mail",
  User: "Contacts",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function DashboardPage() {
  const dash = useApi(() => api.dashboard(), []);
  const camps = useApi(() => api.campaigns(), []);
  const meetings = useApi(() => api.meetings("Upcoming"), []);
  const logs = useApi(() => api.logs(), []);

  if (dash.loading || camps.loading) return <Loading label="Loading dashboard…" />;
  if (dash.error) return <ErrorBox message={dash.error} onRetry={dash.reload} />;
  const d = dash.data!;
  const campaigns = camps.data ?? [];
  const maxFunnel = Math.max(...d.funnel.map((f) => f.value), 1);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your outreach control center — across all campaigns."
        actions={
          <Button href="/campaigns/new">
            <Icon.Plus width={16} height={16} /> New campaign
          </Button>
        }
      />

      {/* Campaign overview */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {([
          { label: "Active campaigns", count: d.active_campaigns, tag: "live", tone: "ok" },
          { label: "Paused campaigns", count: d.paused_campaigns, tag: "on hold", tone: "warn" },
          { label: "Completed campaigns", count: d.completed_campaigns, tag: "done", tone: "info" },
        ] as const).map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-500">{c.label}</span>
              <Badge tone={c.tone}>{c.tag}</Badge>
            </div>
            <div className="mt-2 font-display text-4xl text-ink">{c.count}</div>
          </Card>
        ))}
      </div>

      {/* Outreach metrics */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {metricDefs.map((m) => {
          const MIcon = Icon[m.icon];
          return (
            <Card key={m.key} className="p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/25 text-ink">
                <MIcon width={18} height={18} />
              </div>
              <div className="mt-3 font-display text-3xl text-ink">
                {d[m.key].toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs font-medium text-ink-500">{m.label}</div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Conversion funnel */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Conversion funnel"
            subtitle="Upload → Qualified → Contacted → Replied → Meeting"
          />
          <div className="space-y-4 p-5">
            {d.funnel.map((f, i) => {
              const pct = Math.round((f.value / maxFunnel) * 100);
              const conv =
                i === 0 || d.funnel[i - 1].value === 0
                  ? 100
                  : Math.round((f.value / d.funnel[i - 1].value) * 100);
              return (
                <div key={f.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">{f.label}</span>
                    <span className="text-ink-500">
                      {f.value.toLocaleString()}{" "}
                      <span className="text-xs text-ink-300">
                        ({conv}%{i > 0 ? " of prev" : ""})
                      </span>
                    </span>
                  </div>
                  <div className="h-7 overflow-hidden rounded-lg bg-ink/5">
                    <div
                      className="flex h-full items-center rounded-lg bg-gradient-to-r from-brand-600 to-brand px-2 text-xs font-bold text-ink"
                      style={{ width: `${Math.max(pct, 6)}%` }}
                    >
                      {pct}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Activity feed (from logs) */}
        <Card>
          <CardHeader title="Activity feed" action={<Icon.Bot width={18} height={18} className="text-ink-300" />} />
          <ul className="divide-y divide-line">
            {(logs.data ?? []).slice(0, 6).map((a) => {
              const AIcon = Icon[logIcon[a.category] ?? "Logs"];
              return (
                <li key={a.id} className="flex gap-3 px-5 py-3.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink">
                    <AIcon width={15} height={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{a.message}</p>
                    <p className="mt-0.5 text-xs text-ink-300">{timeAgo(a.created_at)}</p>
                  </div>
                </li>
              );
            })}
            {(logs.data ?? []).length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-ink-300">No activity yet.</li>
            )}
          </ul>
        </Card>
      </div>

      {/* Lower row */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Campaigns"
            action={
              <Button href="/campaigns" variant="ghost" className="px-3 py-1.5 text-xs">
                View all
              </Button>
            }
          />
          <div className="divide-y divide-line">
            {campaigns.slice(0, 4).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                  <p className="truncate text-xs text-ink-500">
                    {c.emails_sent} sent · {c.replies_received} replies · {c.meetings_booked} meetings
                  </p>
                </div>
                <CampaignBadge status={c.status} />
              </div>
            ))}
            {campaigns.length === 0 && (
              <div className="px-5 py-6 text-center text-sm text-ink-300">No campaigns yet.</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Upcoming meetings" />
          <ul className="divide-y divide-line">
            {(meetings.data ?? []).map((m) => (
              <li key={m.id} className="px-5 py-3.5">
                <p className="text-sm font-semibold text-ink">{m.company}</p>
                <p className="text-xs text-ink-500">
                  {m.contact} · {new Date(m.scheduled_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </li>
            ))}
            {(meetings.data ?? []).length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-ink-300">No upcoming meetings.</li>
            )}
            <li className="px-5 py-3">
              <Button href="/meetings" variant="ghost" className="w-full text-xs">
                Open meetings
              </Button>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function CampaignBadge({ status }: { status: Campaign["status"] }) {
  const map: Record<CampaignStatus, "ok" | "warn" | "neutral" | "info" | "danger"> = {
    Running: "ok",
    Paused: "warn",
    Completed: "info",
    Draft: "neutral",
    Failed: "danger",
  };
  return <Badge tone={map[status] ?? "neutral"}>{status}</Badge>;
}
