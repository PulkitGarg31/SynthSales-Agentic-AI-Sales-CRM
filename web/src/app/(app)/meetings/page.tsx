"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Meeting } from "@/lib/api-types";
import type { Tone } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Field";

// ---- helpers ---------------------------------------------------------------

const MEETING_TONE: Record<string, Tone> = {
  Upcoming: "terracotta",
  Completed: "moss",
  Cancelled: "rust",
  "No-show": "amber",
};

/** "Mar 4, 2026 · 14:30" — absolute, 24h. */
function absTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

/** Future-aware relative time: "in 2 days" / "3h ago" / "just now". */
function relTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const future = diff > 0;
  const mins = Math.floor(Math.abs(diff) / 60_000);
  if (mins < 1) return future ? "now" : "just now";
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  if (mins < 60) return fmt(mins, "m");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return fmt(hours, "h");
  const days = Math.floor(hours / 24);
  const word = days === 1 ? "day" : "days";
  return future ? `in ${days} ${word}` : `${days} ${word} ago`;
}

/**
 * Upcoming = status Upcoming AND still in the future, soonest first. Past is
 * everything else, latest first — including overdue still-"Upcoming" meetings,
 * which keep their "Mark completed" button so they can be closed out. One
 * `now` boundary so a meeting can't land in both lists.
 */
function splitMeetings(all: Meeting[]): { upcoming: Meeting[]; past: Meeting[] } {
  const now = Date.now();
  const isUpcoming = (m: Meeting) =>
    m.status === "Upcoming" && new Date(m.scheduled_at).getTime() > now;
  return {
    upcoming: all
      .filter(isUpcoming)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    past: all
      .filter((m) => !isUpcoming(m))
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
  };
}

// ---- local components ------------------------------------------------------

function MeetingCard({ meeting, onSaved }: { meeting: Meeting; onSaved: () => void }) {
  const { busy, run } = useAction();
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const dirty = notes !== (meeting.notes ?? "");

  // The PATCH schema requires `status`, so a notes-only save echoes the
  // current status back unchanged.
  const saveNotes = () =>
    void run(
      "notes",
      () => api.updateMeeting(meeting.id, { status: meeting.status, notes }),
      { success: "Notes saved", onDone: onSaved },
    );

  // Completing carries the notes draft along so an unsaved edit isn't dropped.
  const markCompleted = () =>
    void run(
      "complete",
      () => api.updateMeeting(meeting.id, { status: "Completed", notes }),
      { success: "Meeting marked completed", onDone: onSaved },
    );

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {meeting.company || "—"}
            {meeting.contact && (
              <span className="text-ink-soft"> · {meeting.contact}</span>
            )}
          </p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-soft">
            {absTime(meeting.scheduled_at)}
            <span className="text-ink-faint"> · {relTime(meeting.scheduled_at)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {meeting.status !== "Upcoming" && (
            <Badge tone={MEETING_TONE[meeting.status] ?? "faint"}>{meeting.status}</Badge>
          )}
          {meeting.link && (
            <a
              href={meeting.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/[0.03]"
            >
              Join
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          )}
          {meeting.status === "Upcoming" && (
            <Button
              variant="secondary"
              busy={busy === "complete"}
              disabled={busy !== null}
              onClick={markCompleted}
            >
              Mark completed
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes…"
          aria-label={`Notes for the ${meeting.company} meeting`}
          disabled={busy !== null}
        />
        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost"
            busy={busy === "notes"}
            disabled={!dirty || busy !== null}
            onClick={saveNotes}
            className="px-3 py-1 text-xs"
          >
            Save notes
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---- page ------------------------------------------------------------------

export default function MeetingsPage() {
  const router = useRouter();
  const meetings = useApi(() => api.meetings());
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const all = meetings.data ?? [];
  const { upcoming, past } = splitMeetings(all);
  const rows = tab === "upcoming" ? upcoming : past;

  // Stale-while-reload: only the first fetch gets a skeleton; later reloads
  // (notes save, mark-completed) repaint in place.
  const initialLoad = meetings.loading && meetings.data === null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Meetings</h1>
      </header>

      {initialLoad ? (
        <SkeletonRows n={4} />
      ) : meetings.error ? (
        <ErrorCard message={meetings.error} onRetry={meetings.reload} />
      ) : all.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          line="No meetings on the books — yet."
          action={
            <Button onClick={() => router.push("/conversations")}>
              Open conversations
            </Button>
          }
        />
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as "upcoming" | "past")}
            items={[
              { value: "upcoming", label: "Upcoming", count: upcoming.length },
              { value: "past", label: "Past", count: past.length },
            ]}
          />

          {rows.length === 0 ? (
            <p className="py-10 text-center font-serif italic text-ink-soft">
              {tab === "upcoming"
                ? "Nothing on the calendar right now."
                : "No past meetings yet."}
            </p>
          ) : (
            <div
              className={`space-y-4 ${
                meetings.loading ? "opacity-60 transition-opacity" : "transition-opacity"
              }`}
            >
              {rows.map((m) => (
                <MeetingCard key={m.id} meeting={m} onSaved={meetings.reload} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
