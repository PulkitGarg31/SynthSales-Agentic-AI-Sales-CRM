"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/components/AuthProvider";
import type { Campaign, FunnelStage, Intent, Meeting, ThreadStage } from "@/lib/api-types";
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

/** Whole-percent ratio, 0 when the denominator is 0. */
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function meetingWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Cream→terracotta progression for the funnel - on-palette opacity steps.
const FUNNEL_TONES = [
  "bg-ink/15",
  "bg-ink/30",
  "bg-terracotta/45",
  "bg-terracotta/75",
  "bg-terracotta",
];

// Conversation stages, in lifecycle order, each with an on-palette bar tone.
const STAGE_ORDER: ThreadStage[] = [
  "Contacted",
  "Replied",
  "Negotiating",
  "Meeting",
  "Stalled",
  "Closed",
];
const STAGE_TONE: Record<ThreadStage, string> = {
  Contacted: "bg-ink/25",
  Replied: "bg-terracotta/45",
  Negotiating: "bg-terracotta",
  Meeting: "bg-moss",
  Stalled: "bg-amber",
  Closed: "bg-ink/45",
};

// Reply-intent buckets for the donut + legend, with theme-token colors that
// adapt to light/dark (var() rather than Tailwind classes the scanner may miss).
const INTENT_META: { key: Intent; label: string; color: string }[] = [
  { key: "interested", label: "Interested", color: "var(--color-moss)" },
  { key: "meeting_ready", label: "Meeting-ready", color: "var(--color-terracotta)" },
  { key: "question", label: "Question", color: "var(--color-amber)" },
  { key: "not_interested", label: "Not interested", color: "var(--color-rust)" },
  { key: "out_of_office", label: "Out of office", color: "var(--color-ink-faint)" },
  { key: "other", label: "Other", color: "var(--color-line)" },
];

// ---- charts (hand-rolled, on-palette) --------------------------------------

/** Pipeline funnel: a proportional segmented bar + per-stage count and the
 *  conversion against the top of the funnel (companies uploaded). */
function Funnel({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.value ?? 0;
  const total = stages.reduce((s, f) => s + f.value, 0);
  return (
    <div className="space-y-5">
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5">
        {stages.map((f, i) => (
          <div key={f.label}>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${FUNNEL_TONES[i % FUNNEL_TONES.length]}`}
              />
              <Eyebrow>{f.label}</Eyebrow>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-serif text-2xl leading-none text-ink">{f.value}</span>
              {i > 0 && (
                <span className="text-xs tabular-nums text-ink-faint">{pct(f.value, top)}%</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Conversation progress: a horizontal bar per stage, scaled to the busiest. */
function StageBars({ counts }: { counts: Record<ThreadStage, number> }) {
  const total = STAGE_ORDER.reduce((s, k) => s + counts[k], 0);
  if (total === 0) {
    return <p className="font-serif italic text-ink-soft">No conversations yet.</p>;
  }
  const max = Math.max(1, ...STAGE_ORDER.map((s) => counts[s]));
  return (
    <div className="space-y-3">
      {STAGE_ORDER.map((s) => (
        <div key={s} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm text-ink-soft">{s}</span>
          <div className="h-2.5 flex-1 rounded-full bg-ink/5">
            <div
              className={`h-2.5 rounded-full ${STAGE_TONE[s]} transition-[width] duration-500`}
              style={{ width: `${(counts[s] / max) * 100}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-ink">
            {counts[s]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Reply outcomes: an SVG donut of classified reply intents + a legend. */
function ReplyOutcomes({ counts }: { counts: Record<Intent, number> }) {
  const total = INTENT_META.reduce((s, m) => s + counts[m.key], 0);
  if (total === 0) {
    return <p className="font-serif italic text-ink-soft">No replies classified yet.</p>;
  }
  const R = 40;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const present = INTENT_META.filter((m) => counts[m.key] > 0);
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="relative shrink-0">
        <svg viewBox="0 0 100 100" className="size-36 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="13" stroke="var(--color-line)" />
          {present.map((m) => {
            const len = (counts[m.key] / total) * C;
            const node = (
              <circle
                key={m.key}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                strokeWidth="13"
                stroke={m.color}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-acc}
              />
            );
            acc += len;
            return node;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-3xl leading-none text-ink">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-ink-faint">replies</span>
        </div>
      </div>
      <ul className="space-y-2">
        {present.map((m) => (
          <li key={m.key} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: m.color }}
            />
            <span className="text-ink-soft">{m.label}</span>
            <span className="font-mono text-xs tabular-nums text-ink-faint">
              {counts[m.key]} · {pct(counts[m.key], total)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Per-campaign comparison: counts + a reply-rate bar, busiest first. */
function CampaignTable({ rows }: { rows: Campaign[] }) {
  if (rows.length === 0) {
    return <p className="font-serif italic text-ink-soft">No campaigns yet.</p>;
  }
  const ranked = [...rows].sort((a, b) => b.emails_sent - a.emails_sent).slice(0, 8);
  const maxRate = Math.max(1, ...ranked.map((c) => pct(c.replies_received, c.emails_sent)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-medium text-ink-faint">Campaign</th>
            <th className="pb-2 text-right font-medium text-ink-faint">Sent</th>
            <th className="pb-2 text-right font-medium text-ink-faint">Replied</th>
            <th className="pb-2 text-right font-medium text-ink-faint">Meetings</th>
            <th className="pb-2 pl-4 font-medium text-ink-faint">Reply rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ranked.map((c) => {
            const rate = pct(c.replies_received, c.emails_sent);
            return (
              <tr key={c.id}>
                <td className="py-2.5 pr-2">
                  <span className="block max-w-[14rem] truncate text-ink">{c.name}</span>
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink-soft">{c.emails_sent}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-soft">
                  {c.replies_received}
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink-soft">
                  {c.meetings_booked}
                </td>
                <td className="py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 shrink-0 rounded-full bg-ink/8">
                      <div
                        className="h-1.5 rounded-full bg-terracotta"
                        style={{ width: `${(rate / maxRate) * 100}%` }}
                      />
                    </div>
                    <span className="w-9 text-right font-mono text-xs tabular-nums text-ink">
                      {rate}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  const threads = useApi(() => api.threads());
  const campaigns = useApi(api.campaigns);
  const meetings = useApi(() => api.meetings("Upcoming"));

  const d = dash.data;
  const firstName = me.name.trim().split(/\s+/)[0] || "there";
  const firstRun = d !== null && d.companies_uploaded === 0;

  // ---- derived results ----
  const allThreads = threads.data ?? [];
  const stageCounts = STAGE_ORDER.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<ThreadStage, number>
  );
  for (const t of allThreads) if (t.stage in stageCounts) stageCounts[t.stage] += 1;

  const intentCounts = INTENT_META.reduce(
    (acc, m) => ({ ...acc, [m.key]: 0 }),
    {} as Record<Intent, number>
  );
  for (const t of allThreads)
    if (t.last_intent && t.last_intent in intentCounts) intentCounts[t.last_intent] += 1;

  const qualified = d?.funnel.find((f) => f.label === "Qualified")?.value ?? 0;
  const replyRate = d ? pct(d.replies_received, d.emails_sent) : 0;

  const summary = firstRun
    ? "Let’s get you set up."
    : d
      ? `${d.replies_received} repl${d.replies_received === 1 ? "y" : "ies"} and ${d.meetings_booked} meeting${d.meetings_booked === 1 ? "" : "s"} from ${d.companies_uploaded} companies.`
      : "Here’s how your outreach is performing.";

  const now = Date.now();
  const upcoming = (meetings.data ?? [])
    .filter((m) => new Date(m.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting band */}
      <header>
        <h1 className="display text-3xl sm:text-4xl">
          {greetingForHour(new Date().getHours())}, {firstName}.
        </h1>
        <p className="mt-2 font-serif text-lg italic text-ink-soft">{summary}</p>
      </header>

      {firstRun ? (
        <EmptyState
          title="Welcome to Sellari"
          line="Upload a list. The agents do the rest."
          action={
            <Button onClick={() => router.push("/campaigns/new")}>Start a campaign</Button>
          }
        />
      ) : (
        <>
          {/* Headline outcomes - own the dashboard call's state */}
          {dash.loading ? (
            <SkeletonRows n={2} />
          ) : dash.error ? (
            <ErrorCard message={dash.error} onRetry={dash.reload} />
          ) : d ? (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Card>
                  <StatNumeral value={d.companies_researched} label="Companies researched" />
                </Card>
                <Card>
                  <StatNumeral value={qualified} label="Qualified" />
                </Card>
                <Card>
                  <StatNumeral value={d.replies_received} label="Replies" />
                </Card>
                <Card>
                  <StatNumeral value={replyRate} label="Reply rate %" />
                </Card>
              </div>

              <Card title="Pipeline funnel">
                <Funnel stages={d.funnel} />
              </Card>
            </>
          ) : null}

          {/* Conversation progress | reply outcomes */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Conversation progress">
              {threads.loading ? (
                <SkeletonRows n={4} />
              ) : threads.error ? (
                <ErrorCard message={threads.error} onRetry={threads.reload} />
              ) : (
                <StageBars counts={stageCounts} />
              )}
            </Card>

            <Card title="Reply outcomes">
              {threads.loading ? (
                <SkeletonRows n={4} />
              ) : threads.error ? (
                <ErrorCard message={threads.error} onRetry={threads.reload} />
              ) : (
                <ReplyOutcomes counts={intentCounts} />
              )}
            </Card>
          </div>

          {/* Per-campaign comparison */}
          <Card title="Campaigns">
            {campaigns.loading ? (
              <SkeletonRows n={4} />
            ) : campaigns.error ? (
              <ErrorCard message={campaigns.error} onRetry={campaigns.reload} />
            ) : (
              <CampaignTable rows={campaigns.data ?? []} />
            )}
          </Card>

          {/* Upcoming meetings */}
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
        </>
      )}
    </div>
  );
}
