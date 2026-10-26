"use client";

import { api } from "@/lib/api";
import { PERSONALIZATION_LABELS, TONES } from "@/lib/constants";
import { useApi } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/Skeleton";

/** The wizard's chip groups are stored comma-joined ("SaaS, Cybersecurity").
 *  Splitting on ", " keeps size brackets like "1,000–5,000" intact. */
function chips(value: string): string[] {
  return value.split(", ").map((v) => v.trim()).filter(Boolean);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

function Empty({ children = "Not provided" }: { children?: React.ReactNode }) {
  return <span className="font-serif italic text-ink-soft">{children}</span>;
}

function Text({ value, empty }: { value: string; empty?: string }) {
  return value.trim() ? <>{value}</> : <Empty>{empty}</Empty>;
}

function ChipList({ value, empty }: { value: string; empty?: string }) {
  const items = chips(value);
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((v) => (
        <Badge key={v}>{v}</Badge>
      ))}
    </span>
  );
}

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <Eyebrow index={index}>{title}</Eyebrow>
      <dl className="mt-1 divide-y divide-line">{children}</dl>
    </section>
  );
}

/** Read-only view of everything the user entered when creating the campaign,
 *  grouped like the wizard's steps. */
export function CampaignDetailsModal({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const details = useApi(() => api.campaignDetails(campaignId), [campaignId]);
  const d = details.data;

  return (
    <Modal open wide onClose={onClose} title="Campaign details">
      {details.loading && !d ? (
        <SkeletonRows n={5} />
      ) : details.error ? (
        <ErrorCard message={details.error} onRetry={details.reload} />
      ) : d ? (
        <div className="space-y-6">
          <p className="text-sm text-ink-soft">
            What this campaign was set up with on{" "}
            {new Date(d.created_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            .
          </p>

          <Section index="01" title="Product">
            <Row label="Product / service">
              <Text value={d.product} />
            </Row>
            <Row label="Description">
              <Text value={d.product_description} />
            </Row>
            <Row label="Your industry">
              <Text value={d.industry} />
            </Row>
            <Row label="Value proposition">
              <Text value={d.value_proposition} />
            </Row>
            <Row label="Key differentiators">
              <Text value={d.differentiators} />
            </Row>
          </Section>

          <Section index="02" title="Targeting">
            <Row label="Ideal customer profile">
              <Text value={d.icp} />
            </Row>
            <Row label="Target industries">
              <ChipList value={d.industry_pref} />
            </Row>
            <Row label="Company size">
              <ChipList value={d.company_size} />
            </Row>
            <Row label="Target countries">
              <ChipList value={d.geography} empty="Any country" />
            </Row>
            <Row label="Top companies to pursue">
              <span className="tabular-nums">{d.top_n}</span>
            </Row>
          </Section>

          <Section index="03" title="Outreach">
            <Row label="Tone">{TONES.find((t) => t.value === d.tone)?.label ?? d.tone}</Row>
            <Row label="Personalization">
              {PERSONALIZATION_LABELS[d.personalization_level] ?? d.personalization_level}
            </Row>
            <Row label="Email template">
              <Text value={d.email_template} empty="None (the outreach agent writes each email)" />
            </Row>
            <Row label="Footer / signature">
              <Text value={d.footer} />
            </Row>
          </Section>
        </div>
      ) : null}
    </Modal>
  );
}
