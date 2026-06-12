"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { AdminCampaignDetailCompany } from "@/lib/api-types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { ConfirmModal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/Skeleton";
import {
  CAMPAIGN_TONE,
  COMPANY_TONE,
  DRAFT_TONE,
  MATCH_TONE,
  VERIFICATION_TONE,
} from "@/lib/constants";
import { Drawer } from "./UserTreeDrawer";

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="shrink-0 text-sm text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

// The admin-only debug view: the raw scoring payload, metric_confidence
// included, exactly as the backend persisted it.
function scoringPayload(co: AdminCampaignDetailCompany) {
  return {
    ai_score: co.ai_score,
    match_level: co.match_level,
    metric_confidence: co.metric_confidence,
    enrichment_confidence: co.enrichment_confidence,
    domain_status: co.domain_status,
    score_factors: co.score_factors,
    recent_funding: co.recent_funding,
    recent_news: co.recent_news,
    active_hiring: co.active_hiring,
  };
}

type Removal = { kind: "company" | "contact"; id: number; name: string };

/** Cross-tenant inspector body for one campaign: fields, per-company scoring
    debug, danger ops. Used by both the drawer and /admin/campaigns/[id]. */
export function CampaignInspectorView({
  campaignId,
  onDeleted,
  onChanged,
}: {
  campaignId: number;
  /** Called after a successful campaign delete. */
  onDeleted: () => void;
  /** A row inside the campaign changed (company/contact removed) - refresh counts. */
  onChanged?: () => void;
}) {
  const detail = useApi(() => api.adminCampaignDetail(campaignId), [campaignId]);
  const { run } = useAction();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [removing, setRemoving] = useState<Removal | null>(null);

  const removeRow = async () => {
    if (!removing) return;
    const { kind, id } = removing;
    const ok = await run(
      `admin-remove-${kind}:${id}`,
      () =>
        (kind === "company" ? api.adminDeleteCompany(id) : api.adminDeleteContact(id)).then(
          () => true,
        ),
      { success: kind === "company" ? "Company removed" : "Contact removed" },
    );
    if (!ok) throw new Error("remove failed"); // keep the modal open on failure
    detail.reload();
    onChanged?.();
  };

  const d = detail.data;
  const c = d?.campaign;

  return (
    <>
      {detail.loading ? (
        <SkeletonRows n={6} />
      ) : detail.error ? (
        <ErrorCard message={detail.error} onRetry={detail.reload} />
      ) : d && c ? (
        <div className="space-y-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="display text-2xl">{c.name}</p>
              <p className="mt-0.5 font-mono text-xs text-ink-soft">
                #{c.id} · owner {c.owner_email ?? `user ${c.owner_id}`}
              </p>
            </div>
            <Badge tone={CAMPAIGN_TONE[c.status] ?? "faint"}>{c.status}</Badge>
          </header>

          <section className="rounded-xl border border-line px-4 py-1">
            <dl className="divide-y divide-line">
              <FieldRow label="Product" value={c.product} />
              <FieldRow label="Tone" value={c.tone} />
              <FieldRow label="Top N" value={c.top_n} />
              <FieldRow label="ICP" value={c.icp} />
              <FieldRow label="Industry preference" value={c.industry_pref} />
              <FieldRow label="Geography" value={c.geography} />
              <FieldRow label="Company size" value={c.company_size} />
              <FieldRow label="Business requirements" value={c.business_requirements} />
              <FieldRow label="Ranking criteria" value={c.ranking_criteria} />
            </dl>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-ink">
              Companies ({(d.companies ?? []).length})
            </h3>
            {(d.companies ?? []).length === 0 ? (
              <p className="font-serif italic text-ink-soft">No companies researched yet.</p>
            ) : (
              (d.companies ?? []).map((co) => (
                <article key={co.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-mono text-xs tabular-nums text-ink-faint">
                      {co.rank ? `#${co.rank}` : "-"}
                    </span>
                    <span className="min-w-0 font-medium text-ink">{co.name}</span>
                    <span className="font-mono text-xs tabular-nums text-ink-soft">
                      score {co.ai_score ?? 0}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {co.match_level && (
                        <Badge tone={MATCH_TONE[co.match_level] ?? "faint"}>{co.match_level}</Badge>
                      )}
                      <Badge tone={COMPANY_TONE[co.status] ?? "faint"}>{co.status}</Badge>
                      <button
                        type="button"
                        aria-label={`Remove ${co.name}`}
                        title="Remove company"
                        onClick={() => setRemoving({ kind: "company", id: co.id, name: co.name })}
                        className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-rust/10 hover:text-rust"
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </span>
                  </div>

                  <pre className="mt-3 overflow-x-auto rounded-lg bg-ink/5 p-3 font-mono text-xs leading-relaxed text-ink-soft">
                    {JSON.stringify(scoringPayload(co), null, 2)}
                  </pre>

                  {(co.contacts ?? []).length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {(co.contacts ?? []).map((ct) => (
                        <li
                          key={ct.id}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                        >
                          <span className="font-medium text-ink">{ct.name}</span>
                          <span className="text-xs text-ink-soft">{ct.role}</span>
                          {ct.email && (
                            <span className="font-mono text-xs text-ink-soft">{ct.email}</span>
                          )}
                          <span className="ml-auto flex shrink-0 items-center gap-1.5">
                            {(ct.drafts ?? []).map((dr) => (
                              <Badge key={dr.id} tone={DRAFT_TONE[dr.state] ?? "faint"}>
                                {dr.state}
                              </Badge>
                            ))}
                            <Badge tone={VERIFICATION_TONE[ct.verification] ?? "faint"}>
                              {ct.verification}
                            </Badge>
                            <button
                              type="button"
                              aria-label={`Remove ${ct.name}`}
                              title="Remove contact"
                              onClick={() =>
                                setRemoving({ kind: "contact", id: ct.id, name: ct.name })
                              }
                              className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-rust/10 hover:text-rust"
                            >
                              <Trash2 size={13} strokeWidth={1.75} />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))
            )}
          </section>

          <section className="rounded-xl border border-rust/30 bg-rust/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-soft">
                Delete this campaign and everything researched for it.
              </p>
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                Delete campaign…
              </Button>
            </div>
          </section>

          {removing && (
            <ConfirmModal
              open
              onClose={() => setRemoving(null)}
              onConfirm={removeRow}
              title={removing.kind === "company" ? "Remove company?" : "Remove contact?"}
              body={
                <p>
                  <strong className="font-semibold text-ink">{removing.name}</strong>
                  {removing.kind === "company"
                    ? " and its contacts, drafts and conversations will be permanently removed from this campaign."
                    : " and their drafts and conversations will be permanently removed."}
                </p>
              }
              confirmLabel={removing.kind === "company" ? "Remove company" : "Remove contact"}
              destructive
            />
          )}

          {confirmingDelete && (
            <ConfirmModal
              open
              onClose={() => setConfirmingDelete(false)}
              onConfirm={async () => {
                const ok = await run(
                  `admin-delete-campaign:${campaignId}`,
                  () => api.adminDeleteCampaign(campaignId).then(() => true),
                  { success: "Campaign deleted" },
                );
                // useAction swallows errors (returns null); re-throw so the
                // modal stays open on failure instead of closing as a success.
                if (!ok) throw new Error("delete failed");
                onDeleted();
              }}
              title="Delete campaign?"
              body={
                <p>
                  <strong className="font-semibold text-ink">{c.name}</strong> (owned by{" "}
                  {c.owner_email ?? `user ${c.owner_id}`}) and all of its companies, contacts,
                  drafts and conversations will be permanently deleted.
                </p>
              }
              confirmLabel="Delete campaign"
              destructive
              typedPhrase="confirm"
            />
          )}
        </div>
      ) : null}
    </>
  );
}

export function CampaignInspector({
  campaignId,
  onClose,
  onDeleted,
  onChanged,
}: {
  campaignId: number;
  onClose: () => void;
  onDeleted: () => void;
  onChanged?: () => void;
}) {
  return (
    <Drawer
      onClose={onClose}
      title="Campaign inspector"
      wide
      expandHref={`/admin/campaigns/${campaignId}`}
    >
      <CampaignInspectorView campaignId={campaignId} onDeleted={onDeleted} onChanged={onChanged} />
    </Drawer>
  );
}
