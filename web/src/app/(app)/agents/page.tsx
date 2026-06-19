"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Agent } from "@/lib/api-types";
import { AGENT_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/Modal";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";

// Status dot, matching AGENT_STATUS_TONE (Idle faint / Running terracotta /
// Error rust); Running pulses.
const DOT: Record<string, string> = {
  Idle: "bg-ink/20",
  Running: "animate-pulse bg-terracotta",
  Error: "bg-rust",
};

/** "2h ago"-style relative time; "never" when the agent has never run. */
function relTime(iso?: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const label = (a: Agent) => AGENT_LABELS[a.key] ?? a.name;

// ---- local components ------------------------------------------------------

function Switch({
  checked,
  busy,
  label: name,
  onToggle,
}: {
  checked: boolean;
  busy: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={name}
      aria-busy={busy}
      disabled={busy}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:pointer-events-none disabled:opacity-50 ${
        checked ? "bg-moss" : "bg-ink/20"
      }`}
    >
      <span
        aria-hidden
        className={`size-3.5 rounded-full bg-cream transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function AgentRow({
  agent,
  busy,
  onEnable,
  onRequestDisable,
}: {
  agent: Agent;
  busy: boolean;
  onEnable: () => void;
  onRequestDisable: () => void;
}) {
  const name = label(agent);
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="font-medium text-ink">{name}</p>
          {agent.name !== name && (
            <span className="text-xs text-ink-faint">{agent.name}</span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">{agent.description}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-faint">
          <span
            aria-hidden
            className={`size-2 rounded-full ${DOT[agent.status] ?? "bg-ink/20"}`}
          />
          {agent.status} · last run {relTime(agent.last_run)}
        </p>
      </div>

      <div className="pt-1">
        <Switch
          checked={agent.enabled}
          busy={busy}
          label={name}
          onToggle={agent.enabled ? onRequestDisable : onEnable}
        />
      </div>
    </li>
  );
}

// ---- page ------------------------------------------------------------------

export default function AgentsPage() {
  const agents = useApi(api.agents);
  const { busy, run } = useAction();
  const [disabling, setDisabling] = useState<Agent | null>(null);

  const rows = [...(agents.data ?? [])].sort((a, b) => a.order - b.order);
  const initialLoad = agents.loading && agents.data === null;

  const setEnabled = (a: Agent, enabled: boolean) =>
    run(`toggle:${a.id}`, () => api.updateAgent(a.id, enabled), {
      success: `${label(a)} ${enabled ? "enabled" : "disabled"}`,
      onDone: agents.reload,
    });

  // The backend runs the tracker inline, so the button stays busy until it
  // returns with the number of follow-ups it actually sent.
  const runFollowUps = () =>
    void run("tracking", api.runTracking, {
      success: (r) =>
        `${r.follow_ups_sent} follow-up${r.follow_ups_sent === 1 ? "" : "s"} sent`,
    });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Agents</h1>
        <Button variant="secondary" busy={busy === "tracking"} onClick={runFollowUps}>
          Run follow-ups now
        </Button>
      </header>

      {initialLoad ? (
        <SkeletonRows n={8} />
      ) : agents.error ? (
        <ErrorCard message={agents.error} onRetry={agents.reload} />
      ) : (
        <Card flush className={agents.loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <ul className="divide-y divide-line">
            {rows.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                busy={busy === `toggle:${agent.id}`}
                onEnable={() => void setEnabled(agent, true)}
                onRequestDisable={() => setDisabling(agent)}
              />
            ))}
          </ul>
        </Card>
      )}

      <Card title="How the automation behaves">
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-soft">
          <li>
            The follow-up tracker polls on a schedule. A thread only gets a
            follow-up after our last message has gone unanswered for the
            configured delay. A reply always pauses the sequence.
          </li>
          <li>
            After three unanswered nudges a thread is marked Stalled and left
            alone.
          </li>
          <li>
            The reply reader syncs your inbox every few minutes once a mailbox
            is connected, classifies each reply, and surfaces the ones that
            need you.
          </li>
          <li>
            Disabling an agent makes pipeline runs skip that stage; anything it
            already produced stays put.
          </li>
        </ul>
      </Card>

      {/* Disabling warns first; enabling is instant. Failure keeps the modal
          open; useAction toasts, we re-throw. */}
      <ConfirmModal
        open={disabling !== null}
        onClose={() => setDisabling(null)}
        title={`Disable ${disabling ? label(disabling) : "this agent"}?`}
        body={<p>Pipeline runs will skip this stage.</p>}
        confirmLabel="Disable"
        destructive
        onConfirm={async () => {
          if (!disabling) return;
          const r = await setEnabled(disabling, false);
          if (r === null) throw new Error("disable failed");
        }}
      />
    </div>
  );
}
