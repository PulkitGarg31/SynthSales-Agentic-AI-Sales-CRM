"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { usePipeline } from "@/lib/usePipeline";
import { wsSubscribe } from "@/lib/ws";
import type { Campaign } from "@/lib/api-types";
import { CAMPAIGN_TONE } from "@/lib/constants";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { PipelineTimeline } from "@/components/campaigns/PipelineTimeline";
import { UndoLastRun } from "@/components/campaigns/UndoLastRun";

// ---- helpers ---------------------------------------------------------------

const TONES = [
  { label: "Professional", value: "professional" },
  { label: "Friendly", value: "friendly" },
  { label: "Concise & direct", value: "concise" },
  { label: "Consultative", value: "consultative" },
  { label: "Enthusiastic", value: "enthusiastic" },
];

/** HH:MM:SS for the mono log timestamps. */
function timeHMS(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

// Live WS log frames carry no timestamp - we stamp client receive time.
interface LiveLog {
  key: string;
  time: Date;
  message: string;
  level: string;
}

const LEVEL_TEXT: Record<string, string> = {
  info: "text-ink-soft",
  warn: "text-amber-deep",
  warning: "text-amber-deep",
  error: "text-rust",
};

// ---- local components ------------------------------------------------------

/** Live agent chatter from the shared WS hub - newest at top, capped at 200. */
function LiveLogPanel() {
  const [rows, setRows] = useState<LiveLog[]>([]);
  const seq = useRef(0);

  useEffect(
    () =>
      wsSubscribe((e) => {
        if (e.event !== "log") return;
        const row: LiveLog = {
          key: `l${++seq.current}`,
          time: new Date(),
          message: e.data.message,
          level: e.data.level,
        };
        setRows((prev) => [row, ...prev].slice(0, 200));
      }),
    [],
  );

  return (
    <Card title="Live log" flush className="self-start">
      <div className="mt-3 max-h-[32rem] overflow-y-auto pb-3">
        {rows.length === 0 ? (
          <p className="px-5 pb-2 font-serif italic text-ink-soft">
            Quiet for now. Agent activity streams here as it happens.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.key} className="flex items-baseline gap-3 px-5 py-2">
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                  {timeHMS(r.time)}
                </span>
                <span
                  className={`min-w-0 flex-1 font-mono text-xs ${LEVEL_TEXT[r.level] ?? "text-ink-soft"}`}
                >
                  {r.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function EditCampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { busy, run } = useAction();
  const [name, setName] = useState(campaign.name);
  const [tone, setTone] = useState(campaign.tone);
  const [topN, setTopN] = useState<number>(campaign.top_n);

  // A campaign created before the preset list (or via API) may carry a custom
  // tone - keep it selectable instead of silently snapping to a preset.
  const toneOptions = TONES.some((t) => t.value === campaign.tone)
    ? TONES
    : [{ label: campaign.tone, value: campaign.tone }, ...TONES];

  const valid = name.trim().length > 0 && Number.isFinite(topN) && topN >= 1;
  const saving = busy === "edit";

  const save = () =>
    void run(
      "edit",
      () =>
        api.updateCampaign(campaign.id, {
          name: name.trim(),
          tone,
          top_n: Math.round(topN),
        }),
      {
        success: "Campaign updated",
        onDone: () => {
          onSaved();
          onClose();
        },
      },
    );

  return (
    <Modal open onClose={() => !saving && onClose()} title="Edit campaign">
      <div className="space-y-4">
        <Field label="Name" htmlFor="ec-name">
          <Input
            id="ec-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Tone" htmlFor="ec-tone">
          <Select id="ec-tone" value={tone} onChange={(e) => setTone(e.target.value)}>
            {toneOptions.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Top companies to pursue"
          htmlFor="ec-topn"
          hint="How many companies make the cut as Qualified."
        >
          <Input
            id="ec-topn"
            type="number"
            min={1}
            value={topN}
            onChange={(e) => setTopN(e.target.valueAsNumber)}
            className="w-28"
          />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" busy={saving} disabled={!valid} onClick={save}>
          Save changes
        </Button>
      </div>
    </Modal>
  );
}

// ---- page ------------------------------------------------------------------

function CampaignDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const search = useSearchParams();

  // A 404 resolves to `null` data (not an error): "gone" gets the friendly
  // not-found card below, while real failures keep the retryable ErrorCard.
  const campaign = useApi<Campaign | null>(async () => {
    try {
      return await api.campaign(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }, [id]);

  const pipeline = usePipeline(id);
  const snapshot = useApi(() => api.campaignSnapshot(id), [id]);
  const { busy, run } = useAction();

  // ?fresh=1 (set by the wizard) opens the run-all confirm exactly once:
  // seeded into state at mount, then stripped from the URL so a refresh or
  // closing the modal can't re-trigger it.
  const [runAllOpen, setRunAllOpen] = useState(() => search.get("fresh") === "1");
  const stripped = useRef(false);
  useEffect(() => {
    if (!stripped.current && search.get("fresh") === "1") {
      stripped.current = true;
      router.replace(`/campaigns/${id}`, { scroll: false });
    }
  }, [search, router, id]);

  const [editing, setEditing] = useState(false);

  // After a run is accepted: pick up "Running" rows right away, then poll.
  const started = () => {
    void pipeline.refresh().catch(() => {});
    pipeline.watch();
    snapshot.reload();
  };

  const anyRunning = pipeline.agents?.some((a) => a.status === "Running") ?? false;

  // A snapshot is captured when a run starts; re-check availability once the run
  // finishes so the Undo button appears.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !anyRunning) snapshot.reload();
    wasRunning.current = anyRunning;
  }, [anyRunning, snapshot.reload]);
  const notFound =
    !Number.isInteger(id) ||
    (!campaign.loading && !campaign.error && campaign.data === null);

  if (notFound) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState
          title="Campaign not found"
          line="It may have been deleted, or the link is stale."
          action={
            <Button onClick={() => router.push("/campaigns")}>Back to campaigns</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink href="/campaigns" label="Back to campaigns" />
      {/* Header - owns the campaign call's state */}
      {campaign.loading ? (
        <SkeletonRows n={2} />
      ) : campaign.error ? (
        <ErrorCard message={campaign.error} onRetry={campaign.reload} />
      ) : campaign.data ? (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="display text-3xl sm:text-4xl">{campaign.data.name}</h1>
              <Badge tone={CAMPAIGN_TONE[campaign.data.status]}>
                {campaign.data.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm tabular-nums text-ink-soft">
              {campaign.data.companies_uploaded} companies ·{" "}
              {campaign.data.companies_researched} researched ·{" "}
              {campaign.data.emails_sent} sent · {campaign.data.replies_received}{" "}
              replies · {campaign.data.meetings_booked} meetings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {!anyRunning && (
              <UndoLastRun
                campaignId={id}
                status={snapshot.data}
                onRestored={() => {
                  campaign.reload();
                  started();
                }}
              />
            )}
            <Button
              variant="accent"
              busy={busy === "run-all"}
              disabled={anyRunning}
              onClick={() => setRunAllOpen(true)}
            >
              {anyRunning ? "Pipeline running…" : "Run all agents"}
            </Button>
          </div>
        </header>
      ) : null}

      {/* Timeline | live log - side by side at xl, stacked below */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Agent pipeline">
          {pipeline.agents === null && pipeline.error ? (
            <ErrorCard
              message={pipeline.error}
              onRetry={() =>
                void pipeline
                  .refresh()
                  .then((running) => running && pipeline.watch())
                  .catch(() => {})
              }
            />
          ) : pipeline.agents === null ? (
            <SkeletonRows n={8} />
          ) : (
            <PipelineTimeline campaignId={id} agents={pipeline.agents} onStarted={started} />
          )}
        </Card>

        <LiveLogPanel />
      </div>

      {/* Run-all confirm - also auto-opened by ?fresh=1 from the wizard */}
      <ConfirmModal
        open={runAllOpen}
        onClose={() => setRunAllOpen(false)}
        onConfirm={async () => {
          const ok = await run("run-all", () => api.runCampaign(id), {
            success: (r) =>
              `Pipeline started across ${r.companies} ${r.companies === 1 ? "company" : "companies"}`,
          });
          // useAction swallows errors (returns null); re-throw so the modal
          // stays open on failure instead of closing as if it succeeded.
          if (!ok) throw new Error("run failed");
          campaign.reload();
          started();
        }}
        title="Run the full pipeline?"
        body={
          <p>
            This{" "}
            <strong className="font-semibold text-ink">
              replaces this campaign&rsquo;s existing research, contacts and drafts
            </strong>{" "}
            with fresh results. Companies you marked Approved or Excluded keep their
            status. Expect a few minutes.
          </p>
        }
        confirmLabel="Run all agents"
        destructive
      />

      {editing && campaign.data && (
        <EditCampaignModal
          campaign={campaign.data}
          onClose={() => setEditing(false)}
          onSaved={campaign.reload}
        />
      )}
    </div>
  );
}

export default function CampaignDetailPage() {
  // Next 16: useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl">
          <SkeletonRows n={6} />
        </div>
      }
    >
      <CampaignDetailInner />
    </Suspense>
  );
}
