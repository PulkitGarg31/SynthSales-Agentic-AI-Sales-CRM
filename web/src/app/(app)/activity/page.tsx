"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { wsSubscribe } from "@/lib/ws";
import { LOG_CATEGORIES } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chips } from "@/components/ui/Chips";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";

// ---- helpers ---------------------------------------------------------------

const MAX_ROWS = 500;

// One unified row shape for fetched logs and live WS frames (frames carry no
// timestamp — we stamp them with client receive time, the dashboard pattern).
interface ActivityItem {
  key: string;
  time: Date;
  category: string;
  message: string;
  level: string;
}

// Backend emits "warn"; tolerate "warning" too.
const LEVEL_TEXT: Record<string, string> = {
  info: "text-ink-soft",
  warn: "text-amber-deep",
  warning: "text-amber-deep",
  error: "text-rust",
};

/** "Jun 11 14:03:22" — derived purely from the row's own date. */
function stamp(d: Date): string {
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date} ${d.toTimeString().slice(0, 8)}`;
}

// ---- local components ------------------------------------------------------

function LogRow({ item }: { item: ActivityItem }) {
  return (
    <li className="flex items-baseline gap-3 px-5 py-2.5">
      <span className="shrink-0 font-mono text-xs text-ink-faint">{stamp(item.time)}</span>
      <span
        className={`w-12 shrink-0 font-mono text-xs uppercase ${
          LEVEL_TEXT[item.level] ?? "text-ink-soft"
        }`}
      >
        {item.level}
      </span>
      <Badge>{item.category}</Badge>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft" title={item.message}>
        {item.message}
      </span>
    </li>
  );
}

// ---- page ------------------------------------------------------------------

export default function ActivityPage() {
  const [category, setCategory] = useState<string>("All");
  // Server-side filter: refetch (latest 200) whenever the chip changes.
  const logs = useApi(() => api.logs(category, 200), [category]);

  const [live, setLive] = useState<ActivityItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [buffered, setBuffered] = useState(0);
  // While paused, incoming frames accumulate here (oldest first) and flush to
  // the top on resume. A ref keeps the listener lint-safe; `buffered` mirrors
  // its length purely for the button label.
  const bufferRef = useRef<ActivityItem[]>([]);
  const seq = useRef(0);

  useEffect(
    () =>
      wsSubscribe((e) => {
        if (e.event !== "log") return;
        // Keep the stream consistent with the fetched filter: when a category
        // chip is active, drop non-matching frames (case-insensitive — fetched
        // categories are TitleCase, frames echo whatever the backend logged).
        if (
          category !== "All" &&
          e.data.category.toLowerCase() !== category.toLowerCase()
        )
          return;
        const row: ActivityItem = {
          key: `live-${++seq.current}`,
          time: new Date(),
          category: e.data.category,
          message: e.data.message,
          level: e.data.level,
        };
        if (paused) {
          bufferRef.current.push(row);
          // Cap the buffer like the rendered list — only the newest 500 could
          // survive the flush anyway, so don't hoard older frames in memory.
          if (bufferRef.current.length > MAX_ROWS) bufferRef.current.shift();
          setBuffered(bufferRef.current.length);
        } else {
          setLive((prev) => [row, ...prev].slice(0, MAX_ROWS));
        }
      }),
    [category, paused],
  );

  const togglePaused = () => {
    if (!paused) {
      setPaused(true);
      return;
    }
    // Resume: flush the buffer to the top, newest first, then go live.
    const buffer = bufferRef.current;
    bufferRef.current = [];
    setBuffered(0);
    if (buffer.length > 0) {
      const newestFirst = [...buffer].reverse();
      setLive((prev) => [...newestFirst, ...prev].slice(0, MAX_ROWS));
    }
    setPaused(false);
  };

  const pickCategory = (value: string) => {
    if (value === category) return;
    setCategory(value);
    // Live + buffered rows belong to the previous filter — drop them.
    setLive([]);
    bufferRef.current = [];
    setBuffered(0);
  };

  const rows: ActivityItem[] = [
    ...live,
    ...(logs.data ?? []).map((l) => ({
      key: `log-${l.id}`,
      time: new Date(l.created_at),
      category: l.category as string,
      message: l.message,
      level: l.level as string,
    })),
  ].slice(0, MAX_ROWS);

  const initialLoad = logs.loading && logs.data === null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Activity</h1>
        <Button variant="secondary" onClick={togglePaused}>
          {paused ? (
            <Play aria-hidden className="size-4" />
          ) : (
            <Pause aria-hidden className="size-4" />
          )}
          {paused ? `Resume${buffered > 0 ? ` (${buffered})` : ""}` : "Pause stream"}
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
        <ErrorCard
          message={logs.error}
          onRetry={() => {
            // Drop live + buffered rows too, or a retried fetch would re-list
            // messages that already arrived over the socket.
            setLive([]);
            bufferRef.current = [];
            setBuffered(0);
            logs.reload();
          }}
        />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center font-serif italic text-ink-soft">
          Quiet so far. Agents will report here.
        </p>
      ) : (
        <Card flush>
          <ul className="divide-y divide-line py-1">
            {rows.map((item) => (
              <LogRow key={item.key} item={item} />
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
            showing latest {rows.length} (max {MAX_ROWS})
          </p>
        </Card>
      )}
    </div>
  );
}
