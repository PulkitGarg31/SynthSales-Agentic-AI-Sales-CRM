"use client";

import { useState } from "react";
import {
  Megaphone,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { AGENT_LABELS, LOG_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chips } from "@/components/ui/Chips";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";

// ---- helpers ---------------------------------------------------------------

// Row shape for the activity feed (rows come from GET /api/logs).
interface ActivityItem {
  key: string;
  time: Date;
  category: string;
  message: string;
  level: string;
}

// Each backend category gets a human label + icon for the feed.
const CATEGORY_META: Record<string, { label: string; icon: LucideIcon }> = {
  Campaign: { label: "Campaign", icon: Megaphone },
  AI: { label: "Agents", icon: Sparkles },
  Email: { label: "Email", icon: Send },
  Verification: { label: "Verification", icon: ShieldCheck },
  User: { label: "Account", icon: UserRound },
};

// Agents log under "[<display name>] ..." - map those to the friendly names the
// rest of the UI uses, so the feed reads in the user's vocabulary.
const SOURCE_LABELS: Record<string, string> = {
  "Company Enrichment": "Research",
  "Company Scoring": "Scoring & ranking",
  "Employee Finder": "People finder",
  "Email Guessing & Verification": "Email verifier",
  "Outreach Generation": "Outreach writer",
  "Email Tracking & Follow-up": "Follow-up tracker",
  "Meeting Coordination": "Meeting scheduler",
  "Reply Detection & Intent": "Reply reader",
};

/**
 * Rewrite developer-flavoured log text into something a user can read: turn the
 * agent-trigger line into plain English and strip internal parentheticals.
 * Unknown messages pass through untouched (minus a couple of safe cleanups).
 */
function humanize(message: string): string {
  const trig = message.match(/^Triggered '([^']+)' agent for '(.+?)'( \(force\))?\.$/);
  if (trig) {
    const label = AGENT_LABELS[trig[1]] ?? trig[1];
    return `${trig[3] ? "Re-ran" : "Ran"} ${label} on ${trig[2]}.`;
  }
  return message
    .replace(/\s*\(search\+AI[^)]*\)/gi, "") // (search+AI, confidence 22)
    .replace(/\s*\(confidence \d+\)/gi, "")
    .replace(/\s*\(0 skipped\)/gi, "")
    .replace(/\s*\(\d+ confirmed[^)]*\)/gi, "") // (2 confirmed, 0 best-guess ...)
    .replace(/\s*\([^)]*best-guess[^)]*\)/gi, "")
    .replace(/\bOTP\b/g, "verification code");
}

/** Pull a leading "[Source] " prefix out of the message and humanize the rest. */
function splitMessage(category: string, message: string): { source: string; text: string } {
  const m = message.match(/^\[(.+?)\]\s*([\s\S]*)$/);
  if (m) return { source: SOURCE_LABELS[m[1]] ?? m[1], text: humanize(m[2]) };
  return { source: CATEGORY_META[category]?.label ?? category, text: humanize(message) };
}

/** "2h ago"-style relative time. */
function relTime(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Today / Yesterday / "Fri, Jun 13" - the day a row belongs to. */
function dayLabel(d: Date): string {
  const now = new Date(Date.now());
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "Jun 11, 14:03:22" - the absolute stamp, shown on hover. */
function stamp(d: Date): string {
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date}, ${d.toTimeString().slice(0, 8)}`;
}

// ---- local components ------------------------------------------------------

function LogRow({ item }: { item: ActivityItem }) {
  const meta = CATEGORY_META[item.category] ?? { label: item.category, icon: Sparkles };
  const Icon = meta.icon;
  const { source, text } = splitMessage(item.category, item.message);
  const level = item.level === "warning" ? "warn" : item.level;

  const iconWrap =
    level === "error"
      ? "bg-rust/10 text-rust"
      : level === "warn"
        ? "bg-amber/15 text-amber-deep"
        : "bg-ink/5 text-ink-soft";

  return (
    <li className="flex gap-3 px-5 py-3">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
        <Icon size={16} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{text}</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {source}
          {level !== "info" && (
            <span className={level === "error" ? "text-rust" : "text-amber-deep"}>
              {" · "}
              {level === "error" ? "error" : "warning"}
            </span>
          )}
          {" · "}
          <time dateTime={item.time.toISOString()} title={stamp(item.time)}>
            {relTime(item.time)}
          </time>
        </p>
      </div>
    </li>
  );
}

// ---- page ------------------------------------------------------------------

export default function ActivityPage() {
  const [category, setCategory] = useState<string>("All");
  const [paused, setPaused] = useState(false);
  // Server-side filter: refetch (latest 200) on category change, and poll every
  // 5s while not paused so the feed stays current without a realtime socket.
  const logs = useApi(() => api.logs(category, 200), [category], paused ? null : 5000);

  const togglePaused = () => {
    setPaused((p) => !p);
    if (paused) logs.reload(); // was paused → resuming: refresh immediately
  };

  const pickCategory = (value: string) => {
    if (value !== category) setCategory(value);
  };

  const rows: ActivityItem[] = (logs.data ?? []).map((l) => ({
    key: `log-${l.id}`,
    time: new Date(l.created_at),
    category: l.category as string,
    message: l.message,
    level: l.level as string,
  }));

  // Group consecutive rows by day (rows are already newest-first) so the feed
  // reads as Today / Yesterday / dated sections.
  const groups: { label: string; items: ActivityItem[] }[] = [];
  for (const item of rows) {
    const label = dayLabel(item.time);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  const initialLoad = logs.loading && logs.data === null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl sm:text-4xl">Activity</h1>
          <p className="mt-2 font-serif italic text-ink-soft">
            Everything your agents and account have been up to.
          </p>
        </div>
        <Button variant="secondary" onClick={togglePaused}>
          {paused ? (
            <Play aria-hidden className="size-4" />
          ) : (
            <Pause aria-hidden className="size-4" />
          )}
          {paused ? "Resume" : "Pause refresh"}
        </Button>
      </header>

      <Chips
        options={LOG_CATEGORIES.map((c) => ({ value: c, label: c }))}
        selected={[category]}
        onToggle={pickCategory}
      />

      {initialLoad ? (
        <SkeletonRows n={8} />
      ) : logs.error ? (
        <ErrorCard message={logs.error} onRetry={() => logs.reload()} />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center font-serif italic text-ink-soft">
          Quiet so far. Agents will report here.
        </p>
      ) : (
        <Card flush>
          {groups.map((g, gi) => (
            <div key={g.items[0].key}>
              <p
                className={`px-5 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint ${
                  gi > 0 ? "border-t border-line" : ""
                }`}
              >
                {g.label}
              </p>
              <ul className="divide-y divide-line border-t border-line">
                {g.items.map((item) => (
                  <LogRow key={item.key} item={item} />
                ))}
              </ul>
            </div>
          ))}
          <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
            Showing the latest {rows.length} events.
          </p>
        </Card>
      )}
    </div>
  );
}
