"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { CompanyStatus, MatchLevel } from "@/lib/api-types";

const matchTone: Record<MatchLevel, "ok" | "info" | "warn" | "neutral"> = {
  Strong: "ok",
  Good: "info",
  Moderate: "warn",
  Weak: "neutral",
};

const statusTone: Record<CompanyStatus, "ok" | "info" | "warn" | "neutral" | "danger" | "brand"> = {
  Approved: "ok",
  Qualified: "info",
  Researching: "warn",   // actively in progress / not yet researched
  Reviewed: "neutral",   // research done, not in top-N (or low confidence)
  Contacted: "brand",
  Excluded: "danger",
};

function scoreColor(score: number) {
  if (score >= 85) return "text-ok";
  if (score >= 70) return "text-info";
  if (score >= 55) return "text-warn";
  return "text-ink-500";
}

export default function ResearchPage() {
  const params = useSearchParams();
  const initialCampaign = params.get("campaign");
  const camps = useApi(() => api.campaigns(), []);
  const [campaignId, setCampaignId] = useState<number | null>(
    initialCampaign ? Number(initialCampaign) : null
  );
  const [query, setQuery] = useState("");

  // Default to the query-param campaign, else the first with uploads.
  const campaigns = camps.data ?? [];
  const activeId =
    campaignId ?? campaigns.find((c) => c.companies_uploaded > 0)?.id ?? campaigns[0]?.id ?? null;

  const companies = useApi(
    () => (activeId ? api.campaignCompanies(activeId) : Promise.resolve([])),
    [activeId]
  );

  if (camps.loading) return <Loading label="Loading…" />;
  if (camps.error) return <ErrorBox message={camps.error} onRetry={camps.reload} />;

  const rows = (companies.data ?? [])
    .filter(
      (c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.industry.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));

  return (
    <div>
      <PageHeader
        title="Company Research & Ranking"
        subtitle="AI-researched companies scored and ranked against your ICP. Review, approve, or exclude."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={activeId ?? ""}
          onChange={(e) => setCampaignId(Number(e.target.value))}
          className="form-input max-w-xs"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.companies_uploaded})
            </option>
          ))}
        </select>
        <div className="relative max-w-xs flex-1">
          <Icon.Search width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter companies…"
            className="form-input pl-9"
          />
        </div>
      </div>

      {companies.loading ? (
        <Loading label="Loading companies…" />
      ) : rows.length === 0 ? (
        <Card className="p-0">
          <div className="px-6 py-14 text-center">
            <h3 className="text-lg font-bold text-ink">No companies yet</h3>
            <p className="mt-1 text-sm text-ink-500">
              Upload a CSV and run this campaign to see researched, ranked companies here.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-peach-soft/60 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Rank</th>
                  <th className="px-4 py-3 font-bold">Company</th>
                  <th className="px-4 py-3 font-bold">Industry</th>
                  <th className="px-4 py-3 font-bold">AI score</th>
                  <th className="px-4 py-3 font-bold">Match</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Contacts</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-peach-soft/40">
                    <td className="px-4 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/5 text-xs font-bold text-ink">
                        {c.rank || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/research/${c.id}`} className="font-semibold text-ink hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-xs text-ink-300">{c.domain}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{c.industry}</td>
                    <td className="px-4 py-3">
                      <span className={`font-display text-lg ${scoreColor(c.ai_score)}`}>{c.ai_score}</span>
                    </td>
                    <td className="px-4 py-3"><Badge tone={matchTone[c.match_level]}>{c.match_level}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={statusTone[c.status]}>{c.status}</Badge></td>
                    <td className="px-4 py-3 text-ink-500">{c.contacts_verified}/{c.contacts_found} verified</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/research/${c.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-info hover:underline">
                        View <Icon.Arrow width={14} height={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
