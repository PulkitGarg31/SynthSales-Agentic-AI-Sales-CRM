"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import type { Thread } from "@/lib/api-types";
import { INTENT_TONE, STAGE_TONE } from "@/lib/constants";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chips } from "@/components/ui/Chips";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { ThreadView } from "@/components/conversations/ThreadView";

/** "2h ago"-style relative time. */
function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ThreadRow({
  thread,
  active,
  onSelect,
}: {
  thread: Thread;
  /** Open in the detail pane - also treated as "read" so the dot clears without a refetch. */
  active: boolean;
  onSelect: () => void;
}) {
  const who =
    [thread.company_name, thread.contact_name].filter(Boolean).join(" · ") ||
    thread.email ||
    `Thread #${thread.id}`;
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className={`w-full px-5 py-3 text-left transition ${
          active ? "bg-ink/5" : "hover:bg-ink/[0.03]"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {thread.unread && !active && (
              <span
                aria-hidden
                title="Unread"
                className="size-2 shrink-0 rounded-full bg-terracotta"
              />
            )}
            <span className="truncate font-medium text-ink">{who}</span>
          </span>
          <span className="shrink-0 text-xs text-ink-faint">{relTime(thread.last_activity)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-faint">{thread.subject || "-"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={STAGE_TONE[thread.stage]}>{thread.stage}</Badge>
          {thread.last_intent && (
            <Badge tone={INTENT_TONE[thread.last_intent]}>
              {thread.last_intent.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </button>
    </li>
  );
}

function ConversationsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const { toast } = useToast();
  const { busy, run } = useAction();

  const campaigns = useApi(api.campaigns);

  // Same one-directional chips↔URL sync as outreach: no/invalid ?campaign
  // means "All campaigns". ?thread= carries the open conversation so
  // outreach's "View thread" links land on the right detail pane.
  const all = campaigns.data ?? [];
  const param = Number(search.get("campaign"));
  const selected = all.find((c) => c.id === param) ?? null;
  const selectedId = selected?.id ?? null;

  const threadParam = Number(search.get("thread"));
  const threadId = Number.isInteger(threadParam) && threadParam > 0 ? threadParam : null;

  // Don't fetch until campaigns resolve: a URL like ?campaign=3 would
  // otherwise fire an unscoped fetch first and flash every thread.
  const ready = campaigns.data !== null;
  const threads = useApi<Thread[] | null>(
    () => (ready ? api.threads(selectedId ?? undefined) : Promise.resolve(null)),
    [ready, selectedId],
  );

  const go = (campaign: number | null, thread: number | null) => {
    const params = new URLSearchParams();
    if (campaign !== null) params.set("campaign", String(campaign));
    if (thread !== null) params.set("thread", String(thread));
    const qs = params.toString();
    router.replace(`/conversations${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const syncInbox = () =>
    void run("sync", api.syncInbox, {
      onDone: (r) => {
        // A {0,0} sync with no mailbox isn't "all caught up" - say what's missing.
        if (r.ingested === 0 && r.classified === 0 && !me.mailbox_connected) {
          toast("No mailbox connected. Connect Gmail in Settings → Connections.", "error");
          return;
        }
        toast(`${r.ingested} ingested · ${r.classified} classified`, "success");
        threads.reload();
      },
    });

  const rows = threads.data ?? [];
  // Stale-while-reload: only the very first fetch gets a skeleton; later
  // reloads (chip switch, sync, thread actions) repaint in place.
  const initialLoad = threads.loading && threads.data === null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {selected && <BackLink href={`/campaigns/${selected.id}`} label="Back to campaign" />}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Conversations</h1>
        <div className="flex items-center gap-3">
          {ready && threads.data !== null && !threads.error && (
            <p className="text-sm tabular-nums text-ink-soft">
              {rows.length} {rows.length === 1 ? "thread" : "threads"}
            </p>
          )}
          <Button variant="secondary" busy={busy === "sync"} onClick={syncInbox}>
            Sync inbox
          </Button>
        </div>
      </header>

      {campaigns.loading ? (
        <SkeletonRows n={6} />
      ) : campaigns.error ? (
        <ErrorCard message={campaigns.error} onRetry={campaigns.reload} />
      ) : all.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          line="Threads open when an outreach email goes out. Start with a campaign."
          action={
            <Button onClick={() => router.push("/campaigns/new")}>Start a campaign</Button>
          }
        />
      ) : (
        <>
          <Chips
            options={[
              { value: "all", label: "All campaigns" },
              ...all.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
            selected={[selectedId !== null ? String(selectedId) : "all"]}
            onToggle={(value) => go(value === "all" ? null : Number(value), threadId)}
          />

          {initialLoad ? (
            <SkeletonRows n={6} />
          ) : threads.error ? (
            <ErrorCard message={threads.error} onRetry={threads.reload} />
          ) : rows.length === 0 && threadId === null ? (
            selected ? (
              <p className="py-10 text-center font-serif italic text-ink-soft">
                No conversations in this campaign yet.
              </p>
            ) : (
              <EmptyState
                title="No conversations yet"
                line="Approve and send an outreach draft to open the first thread."
                action={<Button onClick={() => router.push("/outreach")}>Open outreach</Button>}
              />
            )
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
              {/* Inbox list */}
              <Card
                flush
                className={threads.loading ? "opacity-60 transition-opacity" : "transition-opacity"}
              >
                {rows.length === 0 ? (
                  <p className="px-5 py-10 text-center font-serif italic text-ink-soft">
                    No conversations match this filter.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {rows.map((t) => (
                      <ThreadRow
                        key={t.id}
                        thread={t}
                        active={t.id === threadId}
                        onSelect={() => go(selectedId, t.id)}
                      />
                    ))}
                  </ul>
                )}
              </Card>

              {/* Detail pane - fetches by id, so a deep link to a thread outside
                  the current campaign filter still opens (the list just won't
                  highlight it). */}
              {threadId === null ? (
                <Card>
                  <p className="py-10 text-center font-serif italic text-ink-soft">
                    Select a conversation to read it.
                  </p>
                </Card>
              ) : (
                <ThreadView key={threadId} threadId={threadId} onChanged={threads.reload} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ConversationsPage() {
  // Next 16: useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl">
          <SkeletonRows n={6} />
        </div>
      }
    >
      <ConversationsInner />
    </Suspense>
  );
}
