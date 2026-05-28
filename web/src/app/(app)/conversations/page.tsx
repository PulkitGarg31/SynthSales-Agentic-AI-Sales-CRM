"use client";

import { useEffect, useState } from "react";
import { Badge, Button, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { ThreadDetail, ThreadStage } from "@/lib/api-types";

const stageTone: Record<ThreadStage, "neutral" | "info" | "warn" | "ok" | "brand"> = {
  Contacted: "neutral",
  Replied: "info",
  Negotiating: "warn",
  Meeting: "ok",
  Closed: "brand",
};

function time(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ConversationsPage() {
  const threadsQ = useApi(() => api.threads(), []);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const threads = threadsQ.data ?? [];

  useEffect(() => {
    if (activeId === null && threads.length) setActiveId(threads[0].id);
  }, [threads, activeId]);

  useEffect(() => {
    if (activeId === null) return;
    let on = true;
    api.thread(activeId).then((t) => on && setActive(t));
    return () => {
      on = false;
    };
  }, [activeId]);

  if (threadsQ.loading) return <Loading label="Loading conversations…" />;
  if (threadsQ.error) return <ErrorBox message={threadsQ.error} onRetry={threadsQ.reload} />;

  async function send() {
    if (!active || !reply.trim()) return;
    setBusy(true);
    try {
      const updated = await api.reply(active.id, reply);
      setActive(updated);
      setReply("");
      threadsQ.reload();
    } finally {
      setBusy(false);
    }
  }

  if (threads.length === 0) {
    return (
      <div>
        <PageHeader title="Conversations" subtitle="CRM-style inbox — Campaign → Company → Contact → Thread." />
        <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center">
          <h3 className="text-lg font-bold text-ink">No conversations yet</h3>
          <p className="mt-1 text-sm text-ink-500">Approve and send a draft from Email Review to start a thread.</p>
          <Button href="/email-review" className="mt-4">Go to Email Review</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Conversations" subtitle="CRM-style inbox — Campaign → Company → Contact → Thread." />

      <div className="grid h-[calc(100vh-220px)] grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-[320px_1fr]">
        <div className="hidden flex-col border-r border-line md:flex">
          <div className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink-500">Threads</div>
          <ul className="flex-1 divide-y divide-line overflow-y-auto">
            {threads.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setActiveId(c.id)}
                  className={`w-full px-4 py-3 text-left ${c.id === activeId ? "bg-brand/10" : "hover:bg-ink/5"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{c.contact_name || c.subject}</span>
                    {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                  </div>
                  <p className="truncate text-xs text-ink-500">{c.company_name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <Badge tone={stageTone[c.stage]}>{c.stage}</Badge>
                    <span className="text-[11px] text-ink-300">{time(c.last_activity)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col">
          {active ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <div>
                  <p className="font-semibold text-ink">
                    {active.contact_name}{" "}
                    <span className="font-normal text-ink-300">· {active.role}</span>
                  </p>
                  <p className="text-xs text-ink-500">{active.company_name} · {active.email}</p>
                </div>
                <Badge tone={stageTone[active.stage]}>{active.stage}</Badge>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto bg-canvas px-5 py-5">
                {active.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "us" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.direction === "us" ? "bg-ink text-white" : "bg-surface text-ink ring-1 ring-line"}`}>
                      {m.subject && <p className="mb-1 text-xs font-bold opacity-80">{m.subject}</p>}
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      <p className={`mt-1.5 text-[11px] ${m.direction === "us" ? "text-white/60" : "text-ink-300"}`}>
                        {m.author} · {time(m.sent_at)}{m.is_follow_up && " · auto follow-up"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {active.ai_suggestion && (
                <div className="mx-5 mt-3 flex items-start gap-2 rounded-xl bg-brand/15 px-3 py-2.5 text-sm text-ink">
                  <Icon.Sparkle width={16} height={16} className="mt-0.5 shrink-0 text-brand-700" />
                  <div>
                    <span className="font-semibold">AI suggestion: </span>
                    {active.ai_suggestion}
                    <button onClick={() => setReply(active.ai_suggestion!)} className="ml-2 font-semibold text-info hover:underline">Use</button>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2 border-t border-line p-4">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  placeholder="Write a reply…"
                  className="form-input resize-none"
                />
                <Button onClick={send} className="h-10" disabled={busy}>
                  <Icon.Arrow width={16} height={16} /> Send
                </Button>
              </div>
            </>
          ) : (
            <Loading label="Loading thread…" />
          )}
        </div>
      </div>
    </div>
  );
}
