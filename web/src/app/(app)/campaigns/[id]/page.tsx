"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Progress } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { CampaignStatus, PipelineAgent } from "@/lib/api-types";

const statusTone: Record<CampaignStatus, "ok" | "warn" | "info" | "neutral" | "danger"> = {
  Running: "ok",
  Paused: "warn",
  Completed: "info",
  Draft: "neutral",
  Failed: "danger",
};

const agentStatusTone: Record<PipelineAgent["status"], "neutral" | "ok" | "danger"> = {
  Idle: "neutral",
  Running: "ok",
  Error: "danger",
};

// Where each agent's results live in the rest of the app.
function resultsLink(key: string, campaignId: number): { href: string; label: string } | null {
  switch (key) {
    case "enrichment":
    case "scoring":
      return { href: `/research?campaign=${campaignId}`, label: "View research" };
    case "employee_finder":
    case "email_guess_verification":
      return { href: `/contacts?campaign=${campaignId}`, label: "View contacts" };
    case "outreach":
      return { href: `/email-review?campaign=${campaignId}`, label: "View drafts" };
    case "tracking":
      return { href: `/conversations?campaign=${campaignId}`, label: "View threads" };
    case "meeting":
      return { href: `/meetings`, label: "View meetings" };
    default:
      return null;
  }
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const campaignQ = useApi(() => api.campaign(id), [id]);
  const pipelineQ = useApi(() => api.campaignPipeline(id), [id]);

  const [busyAll, setBusyAll] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function runAll() {
    setBusyAll(true);
    setError(null);
    try {
      await api.runCampaign(id);
      flash("Pipeline started — running all agents");
      // Pipeline runs in background; refresh after a beat so statuses update.
      setTimeout(() => {
        campaignQ.reload();
        pipelineQ.reload();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start pipeline");
    } finally {
      setBusyAll(false);
    }
  }

  async function runOne(key: string) {
    setBusyKey(key);
    setError(null);
    try {
      // Per-agent triggers always force-clear the prior output so a re-run
      // produces genuinely fresh research instead of returning the stale data
      // the user already saw (or rejected).
      await api.runCampaignAgent(id, key, true);
      flash(`Agent started — ${key}`);
      setTimeout(() => pipelineQ.reload(), 1500);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError(e instanceof Error ? e.message : "Failed to start agent");
    } finally {
      setBusyKey(null);
    }
  }

  if (campaignQ.loading) return <Loading label="Loading campaign…" />;
  if (campaignQ.error) return <ErrorBox message={campaignQ.error} onRetry={campaignQ.reload} />;
  const c = campaignQ.data!;

  const stages = pipelineQ.data ?? [];
  const anyRunning = stages.some((s) => s.status === "Running");

  return (
    <div>
      <Link
        href="/campaigns"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink"
      >
        ← All campaigns
      </Link>

      <PageHeader
        title={c.name}
        subtitle={c.product || "Untitled product"}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={statusTone[c.status]}>{c.status}</Badge>
            <Button onClick={runAll} disabled={busyAll || anyRunning}>
              <Icon.Play width={16} height={16} />{" "}
              {busyAll ? "Starting…" : anyRunning ? "Running…" : "Run all agents"}
            </Button>
          </div>
        }
      />

      {/* Campaign stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Companies" value={c.companies_uploaded} />
        <Stat label="Researched" value={c.companies_researched} subtitle={`of ${c.companies_uploaded}`} />
        <Stat label="Emails sent" value={c.emails_sent} />
        <Stat label="Meetings" value={c.meetings_booked} subtitle={`${c.replies_received} replies`} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* Pipeline */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl text-ink">Agent pipeline</h2>
            <p className="text-sm text-ink-500">
              Run the whole sequence, or any individual stage. Each stage links to its results.
            </p>
          </div>
          <button
            onClick={() => pipelineQ.reload()}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-500 hover:bg-ink/5"
          >
            ↻ Refresh
          </button>
        </div>

        {pipelineQ.loading ? (
          <Loading label="Loading pipeline…" />
        ) : pipelineQ.error ? (
          <ErrorBox message={pipelineQ.error} onRetry={pipelineQ.reload} />
        ) : (
          <ol className="relative space-y-3">
            {/* Vertical connector behind the numbered nodes */}
            <div className="pointer-events-none absolute left-[19px] top-3 bottom-3 w-px bg-line" />
            {stages.map((s) => (
              <AgentRow
                key={s.key}
                stage={s}
                campaignId={id}
                onRun={runOne}
                runningKey={busyKey}
              />
            ))}
          </ol>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, subtitle }: { label: string; value: number; subtitle?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
      <p className="mt-1 font-display text-3xl text-ink">{value}</p>
      {subtitle && <p className="text-xs text-ink-300">{subtitle}</p>}
    </Card>
  );
}

function AgentRow({
  stage,
  campaignId,
  onRun,
  runningKey,
}: {
  stage: PipelineAgent;
  campaignId: number;
  onRun: (key: string) => void;
  runningKey: string | null;
}) {
  const link = resultsLink(stage.key, campaignId);
  const pct = stage.total > 0 ? Math.round((stage.completed / stage.total) * 100) : 0;
  const isDone = stage.total > 0 && stage.completed >= stage.total;
  const isBusy = runningKey === stage.key || stage.status === "Running";

  return (
    <li className="relative">
      <div className="flex items-stretch gap-4">
        {/* Numbered node on the vertical timeline */}
        <div className="relative flex w-10 shrink-0 items-start justify-center pt-5">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ring-4 ring-canvas ${
              stage.status === "Running"
                ? "bg-ok text-white"
                : isDone
                ? "bg-brand text-ink"
                : stage.status === "Error"
                ? "bg-danger text-white"
                : "bg-ink/10 text-ink-500"
            }`}
          >
            {stage.status === "Running" ? (
              <span className="h-3 w-3 animate-ping rounded-full bg-white" />
            ) : isDone ? (
              <Icon.Check width={16} height={16} />
            ) : (
              stage.order
            )}
          </span>
        </div>

        <Card className={`flex-1 p-5 ${!stage.enabled ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-ink">{stage.name}</h3>
                <Badge tone={agentStatusTone[stage.status]}>{stage.status}</Badge>
                {!stage.enabled && (
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-ink-500">
                    Disabled
                  </span>
                )}
                {!stage.runnable && (
                  <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info">
                    Auto
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-500">{stage.description}</p>
            </div>

            <div className="flex items-center gap-2">
              {link && (
                <Link
                  href={link.href}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-500 hover:bg-ink/5"
                >
                  {link.label} →
                </Link>
              )}
              {stage.runnable && (
                <button
                  onClick={() => onRun(stage.key)}
                  disabled={isBusy || !stage.enabled}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white hover:bg-ink/90 disabled:opacity-50"
                >
                  <Icon.Play width={13} height={13} />
                  {isBusy ? "Running…" : isDone ? "Re-run" : "Run"}
                </button>
              )}
            </div>
          </div>

          {/* Progress + last run */}
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <div className="mb-1 flex justify-between text-xs text-ink-500">
                <span>
                  {stage.total === 0
                    ? "No work yet"
                    : `${stage.completed} / ${stage.total}`}
                </span>
                <span>{stage.total > 0 ? `${pct}%` : ""}</span>
              </div>
              <Progress value={pct} />
            </div>
            <div className="text-xs text-ink-300 sm:text-right">
              Last run:{" "}
              {stage.last_run
                ? new Date(stage.last_run).toLocaleString()
                : "never"}
            </div>
          </div>
        </Card>
      </div>
    </li>
  );
}
