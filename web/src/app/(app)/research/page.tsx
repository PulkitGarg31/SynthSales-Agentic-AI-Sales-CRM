"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Company } from "@/lib/api-types";
import { COMPANY_TONE, DOMAIN_TONE, MATCH_TONE } from "@/lib/constants";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chips } from "@/components/ui/Chips";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";

// ---- helpers ---------------------------------------------------------------

const TH = "px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint";

const SITE_LABEL: Record<Company["domain_status"], string> = {
  live: "Site live",
  parked: "Site parked",
  dead: "Site unreachable",
  unknown: "-",
};

// ---- local components ------------------------------------------------------

function CompanyRow({ company }: { company: Company }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        // Respect open-in-new-tab intent and in-progress text selection.
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (window.getSelection()?.toString()) return;
        router.push(`/research/${company.id}?campaign=${company.campaign_id}`);
      }}
      className="cursor-pointer transition-colors hover:bg-cream/60"
    >
      <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
        {company.rank > 0 ? company.rank : "-"}
      </td>
      <td className="px-5 py-3">
        <p className="font-medium text-ink">{company.name}</p>
        <p className="mt-0.5 font-mono text-xs text-ink-faint">{company.domain || "-"}</p>
      </td>
      <td className="px-5 py-3 text-right">
        <span className="font-serif text-2xl leading-none">{company.ai_score}</span>
      </td>
      <td className="px-5 py-3">
        <Badge tone={MATCH_TONE[company.match_level]}>{company.match_level}</Badge>
      </td>
      <td className="px-5 py-3">
        <Badge tone={COMPANY_TONE[company.status]}>{company.status}</Badge>
      </td>
      <td className="px-5 py-3">
        <Badge tone={DOMAIN_TONE[company.domain_status]}>
          {SITE_LABEL[company.domain_status]}
        </Badge>
      </td>
      <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
        {company.enrichment_confidence}/100
      </td>
      <td className="px-5 py-3 text-right tabular-nums">{company.contacts_found}</td>
    </tr>
  );
}

// ---- page ------------------------------------------------------------------

function ResearchInner() {
  const router = useRouter();
  const search = useSearchParams();
  const campaigns = useApi(api.campaigns);

  // Selection is DERIVED, never written back to the URL except on a chip
  // click - that keeps the chips↔URL sync one-directional (no replace loops).
  // An invalid/absent ?campaign falls back to the first (newest) campaign.
  const all = campaigns.data ?? [];
  const param = Number(search.get("campaign"));
  const selected = all.find((c) => c.id === param) ?? all[0] ?? null;
  const selectedId = selected?.id ?? null;
  // Back link shows only when the URL is actually scoped to a campaign (the
  // drill-in from a pipeline agent), not the newest-campaign display fallback.
  const scoped = all.find((c) => c.id === param) ?? null;

  // Companies are kept in backend order (rank ASC, then name - the ranked
  // research order). While no campaign is selectable yet, resolve empty.
  const companies = useApi<Company[]>(
    () => (selectedId === null ? Promise.resolve([]) : api.campaignCompanies(selectedId)),
    [selectedId],
  );

  const rows = companies.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {scoped && <BackLink href={`/campaigns/${scoped.id}`} label="Back to campaign" />}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Research</h1>
        {selected && !companies.loading && !companies.error && (
          <p className="text-sm tabular-nums text-ink-soft">
            {rows.length} {rows.length === 1 ? "company" : "companies"}
          </p>
        )}
      </header>

      {campaigns.loading ? (
        <SkeletonRows n={6} />
      ) : campaigns.error ? (
        <ErrorCard message={campaigns.error} onRetry={campaigns.reload} />
      ) : all.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          line="Research starts once there's an expedition to send the agents on."
          action={
            <Button onClick={() => router.push("/campaigns/new")}>Start a campaign</Button>
          }
        />
      ) : (
        <>
          <Chips
            options={all.map((c) => ({ value: String(c.id), label: c.name }))}
            selected={selectedId !== null ? [String(selectedId)] : []}
            onToggle={(value) =>
              router.replace(`/research?campaign=${value}`, { scroll: false })
            }
          />

          {companies.loading ? (
            <SkeletonRows n={6} />
          ) : companies.error ? (
            <ErrorCard message={companies.error} onRetry={companies.reload} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No companies yet"
              line="Upload a CSV in the campaign to give the agents something to dig into."
              action={
                selected && (
                  <Button onClick={() => router.push(`/campaigns/${selected.id}`)}>
                    Open campaign
                  </Button>
                )
              }
            />
          ) : (
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={`${TH} text-right`}>Rank</th>
                      <th className={TH}>Company</th>
                      <th className={`${TH} text-right`}>Score</th>
                      <th className={TH}>Match</th>
                      <th className={TH}>Status</th>
                      <th className={TH}>Site</th>
                      <th className={`${TH} text-right`}>Confidence</th>
                      <th className={`${TH} text-right`}>Contacts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((c) => (
                      <CompanyRow key={c.id} company={c} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function ResearchPage() {
  // Next 16: useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl">
          <SkeletonRows n={6} />
        </div>
      }
    >
      <ResearchInner />
    </Suspense>
  );
}
