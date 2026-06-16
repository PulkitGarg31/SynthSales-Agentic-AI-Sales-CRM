"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { PipelineAgent } from "@/lib/api-types";
import { AGENT_LABELS, AGENT_STATUS_TONE } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";

// Status dot, matching AGENT_STATUS_TONE (Idle faint / Running terracotta /
// Error rust); Running pulses.
const DOT: Record<string, string> = {
  Idle: "bg-ink/20",
  Running: "animate-pulse bg-terracotta",
  Error: "bg-rust",
};

// Stages the backend marks non-runnable fire on their own triggers, not a
// button - say which trigger.
const NON_RUNNABLE_NOTE: Record<string, string> = {
  meeting: "Fires when you book a meeting from a conversation.",
  reply_classifier: "Runs when your inbox syncs.",
};

// Each agent's outputs already live on a results page; clicking the agent opens
// that page scoped to this campaign. Every target accepts ?campaign=<id> except
// meetings (which isn't campaign-filtered).
const RESULTS: Record<string, { path: string; noun: string }> = {
  enrichment: { path: "/research", noun: "research" },
  scoring: { path: "/research", noun: "research" },
  employee_finder: { path: "/contacts", noun: "contacts" },
  email_guess_verification: { path: "/contacts", noun: "contacts" },
  outreach: { path: "/outreach", noun: "drafts" },
  tracking: { path: "/conversations", noun: "conversations" },
  reply_classifier: { path: "/conversations", noun: "conversations" },
  meeting: { path: "/meetings", noun: "meetings" },
};

function resultsLink(key: string, campaignId: number): { href: string; noun: string } | null {
  const dest = RESULTS[key];
  if (!dest) return null;
  // Every target carries ?campaign=<id>: the campaign-filtered pages use it to
  // scope, and /meetings (unscoped) uses it only to offer a back link.
  return { href: `${dest.path}?campaign=${campaignId}`, noun: dest.noun };
}

/** "2h ago"-style relative time; "-" when the agent has never run. */
function relTime(iso?: string | null): string {
  if (!iso) return "-";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AgentRow({
  agent,
  campaignId,
  last,
  busy,
  onRun,
  onRerun,
}: {
  agent: PipelineAgent;
  campaignId: number;
  /** Last row in the rail - no connecting line below its dot. */
  last: boolean;
  busy: string | null;
  onRun: (agent: PipelineAgent) => void;
  onRerun: (agent: PipelineAgent) => void;
}) {
  const label = AGENT_LABELS[agent.key] ?? agent.name;
  const running = agent.status === "Running";
  // Lock this row's controls while ITS run is in flight (or the agent is
  // already Running) - other rows stay usable.
  const locked = running || (busy !== null && busy.endsWith(`:${agent.key}`));
  const pct =
    agent.total > 0
      ? Math.min(100, Math.round((agent.completed / agent.total) * 100))
      : 0;
  const link = resultsLink(agent.key, campaignId);

  return (
    <li className="flex gap-4">
      {/* Rail: status dot + connecting line */}
      <div className="flex flex-col items-center">
        <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[agent.status] ?? "bg-ink/20"}`} />
        {!last && <span aria-hidden className="w-px flex-1 bg-line" />}
      </div>

      <div className={`min-w-0 flex-1 ${last ? "" : "pb-7"}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {link ? (
            <Link
              href={link.href}
              className="text-sm font-medium text-ink underline-offset-2 transition-colors hover:text-terracotta hover:underline"
            >
              {label}
            </Link>
          ) : (
            <p className="text-sm font-medium text-ink">{label}</p>
          )}
          {agent.status !== "Idle" && (
            <Badge tone={AGENT_STATUS_TONE[agent.status]}>{agent.status}</Badge>
          )}
          <span className="ml-auto text-xs text-ink-faint">{relTime(agent.last_run)}</span>
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">{agent.description}</p>

        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-1 flex-1 rounded-full bg-ink/8">
            <div
              className="h-1 rounded-full bg-terracotta transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-ink-faint">
            {agent.completed}/{agent.total}
          </span>
        </div>

        {agent.runnable ? (
          <div className="mt-3 flex items-center gap-4">
            <Button
              variant="secondary"
              busy={busy === `run:${agent.key}`}
              disabled={locked}
              onClick={() => onRun(agent)}
              className="px-3 py-1 text-xs"
            >
              {running ? "Running…" : "Run"}
            </Button>
            <button
              type="button"
              disabled={locked}
              onClick={() => onRerun(agent)}
              className="text-xs font-medium text-ink-soft underline-offset-2 transition-colors hover:text-terracotta hover:underline disabled:pointer-events-none disabled:opacity-50"
            >
              Re-run fresh…
            </button>
            {link && (
              <Link
                href={link.href}
                className="ml-auto shrink-0 text-xs font-medium text-terracotta underline-offset-2 hover:underline"
              >
                View {link.noun} →
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-4">
            <p className="text-xs italic text-ink-faint">
              {NON_RUNNABLE_NOTE[agent.key] ?? "Runs automatically."}
            </p>
            {link && (
              <Link
                href={link.href}
                className="ml-auto shrink-0 text-xs font-medium text-terracotta underline-offset-2 hover:underline"
              >
                View {link.noun} →
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function PipelineTimeline({
  campaignId,
  agents,
  onStarted,
}: {
  campaignId: number;
  agents: PipelineAgent[];
  /** Called after a run is accepted - refresh the pipeline and start polling. */
  onStarted: () => void;
}) {
  const { busy, run } = useAction();
  const [rerunning, setRerunning] = useState<PipelineAgent | null>(null);

  const sorted = [...agents].sort((a, b) => a.order - b.order);

  const start = (agent: PipelineAgent, force: boolean) =>
    run(
      `${force ? "rerun" : "run"}:${agent.key}`,
      () => api.runCampaignAgent(campaignId, agent.key, force),
      {
        success: `${AGENT_LABELS[agent.key] ?? agent.name} started`,
        onDone: onStarted,
      },
    );

  return (
    <>
      <ol>
        {sorted.map((agent, i) => (
          <AgentRow
            key={agent.key}
            agent={agent}
            campaignId={campaignId}
            last={i === sorted.length - 1}
            busy={busy}
            onRun={(a) => void start(a, false)}
            onRerun={setRerunning}
          />
        ))}
      </ol>

      {rerunning && (
        <ConfirmModal
          open
          onClose={() => setRerunning(null)}
          onConfirm={async () => {
            const ok = await start(rerunning, true);
            // useAction swallows errors (returns null); re-throw so the modal
            // stays open on failure instead of closing as if it succeeded.
            if (!ok) throw new Error("run failed");
          }}
          title={`Re-run ${AGENT_LABELS[rerunning.key] ?? rerunning.name} from scratch?`}
          body={
            <p>
              This discards this stage&rsquo;s previous results for the campaign before
              re-running. Already-verified emails are kept.
            </p>
          }
          confirmLabel="Re-run fresh"
        />
      )}
    </>
  );
}
