"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { CampaignCreate } from "@/lib/api-types";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chips, type ChipOption } from "@/components/ui/Chips";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { CsvDrop } from "@/components/campaigns/CsvDrop";

// ---- presets (carried over from the pre-rebuild wizard) ----------------------

const chips = (values: string[]): ChipOption[] => values.map((v) => ({ value: v, label: v }));

const INDUSTRIES = chips([
  "Aerospace & Defense", "Agriculture", "Automotive", "Banking", "Biotechnology",
  "Chemicals", "Construction", "Consulting", "Consumer Goods", "Cybersecurity",
  "E-commerce", "Education", "Energy", "Financial Services", "Food & Beverage",
  "Gaming", "Government / Public Sector", "Healthcare", "Hospitality", "Insurance",
  "Legal Services", "Logistics", "Manufacturing", "Marketing & Advertising", "Media",
  "Mining & Metals", "Non-Profit", "Pharmaceuticals", "Professional Services",
  "Real Estate", "Retail", "SaaS", "Technology", "Telecommunications",
  "Transportation", "Travel", "Utilities", "Wholesale Distribution",
]);

const COUNTRIES = chips([
  "United States", "Canada", "Mexico", "United Kingdom", "Ireland", "Germany",
  "France", "Netherlands", "Spain", "Italy", "Sweden", "Denmark", "Switzerland",
  "Australia", "New Zealand", "Japan", "South Korea", "Singapore", "India", "UAE",
  "Saudi Arabia", "Israel", "Brazil", "South Africa",
]);

const SIZES = chips(["1–50", "51–200", "201–1,000", "1,000–5,000", "5,000+"]);

// Short chip label → the full sentence the scoring agent sees. The old wizard
// always sent the full set; here the user prunes - so all start selected.
const BUYING_SIGNALS: ChipOption[] = [
  ["Recent funding", "Recent funding (Series A or later) or visible revenue growth"],
  ["Headcount growth", "Headcount growth in the last 6–12 months"],
  ["Actively hiring", "Actively hiring, especially roles adjacent to our buyer persona"],
  ["Modernization underway", "Cloud, data, or core-systems modernization underway"],
  ["Market expansion", "Expansion into new markets, geographies, or product lines"],
  ["Uses a competitor", "Uses a competitor product or an obvious adjacent tool"],
  ["Leadership change", "Recent leadership change in the buyer's function"],
  ["M&A / rebrand", "Recent M&A, partnership, or rebrand activity"],
  ["Compliance deadline", "Compliance, regulatory, or audit deadline forcing change"],
  ["Public investment signals", "Public engineering / product / careers content signalling investment in this area"],
].map(([label, value]) => ({ label, value }));

const RANKING_FACTORS: ChipOption[] = [
  ["Product fit", "Product fit: how directly our product solves their stated pain"],
  ["Industry alignment", "Industry alignment with the configured target industries"],
  ["Size match", "Company size match with the configured size brackets"],
  ["Geography match", "Geography match with the configured target countries"],
  ["Growth indicators", "Growth indicators (headcount, revenue, market expansion)"],
  ["Funding events", "Recent funding or financial events"],
  ["Hiring activity", "Hiring activity in buyer or end-user roles"],
  ["Tech-stack overlap", "Tech-stack overlap with our product or its integrations"],
  ["Buyer accessibility", "Buyer accessibility: decision makers visible on LinkedIn"],
  ["Trigger recency", "Recency of relevant trigger events or news"],
].map(([label, value]) => ({ label, value }));

const TONES = [
  { label: "Professional", value: "professional" },
  { label: "Friendly", value: "friendly" },
  { label: "Concise & direct", value: "concise" },
  { label: "Consultative", value: "consultative" },
  { label: "Enthusiastic", value: "enthusiastic" },
];

const FOOTER_PLACEHOLDER = `Jordan Pierce
Account Executive · Apex Cloud
jordan@apexcloud.com · +1 (415) 555-0142`;

const TEMPLATE_PLACEHOLDER = `Hi {{first_name}},

{{personalized_intro}}

{{value_prop}}

Best,
{{sender}}`;

// ---- draft state -------------------------------------------------------------

// Mirrors CampaignCreate, except the four chip groups are arrays here and get
// joined into their string fields (industry_pref / geography / company_size /
// business_requirements / ranking_criteria) at submit time.
interface Draft {
  name: string;
  product: string;
  product_description: string;
  value_proposition: string;
  industry: string;
  differentiators: string;
  icp: string;
  industries: string[];
  geographies: string[];
  sizes: string[];
  signals: string[];
  ranking: string[];
  top_n: number;
  tone: string;
  email_template: string;
  footer: string;
  personalization_level: number;
}

const INITIAL: Draft = {
  name: "",
  product: "",
  product_description: "",
  value_proposition: "",
  industry: "",
  differentiators: "",
  icp: "",
  industries: [],
  geographies: [],
  sizes: [],
  signals: BUYING_SIGNALS.map((s) => s.value),
  ranking: RANKING_FACTORS.map((r) => r.value),
  top_n: 50,
  tone: "professional",
  email_template: "",
  footer: "",
  personalization_level: 2,
};

function toPayload(d: Draft): CampaignCreate {
  return {
    name: d.name.trim(),
    product: d.product.trim(),
    tone: d.tone,
    top_n: Math.max(1, Math.round(d.top_n) || 50),
    product_description: d.product_description.trim(),
    value_proposition: d.value_proposition.trim(),
    industry: d.industry.trim(),
    differentiators: d.differentiators.trim(),
    icp: d.icp.trim(),
    industry_pref: d.industries.join(", "),
    geography: d.geographies.join(", "),
    company_size: d.sizes.join(", "),
    business_requirements: d.signals.join("; "),
    ranking_criteria: d.ranking.join("; "),
    email_template: d.email_template,
    footer: d.footer,
    personalization_level: d.personalization_level,
  };
}

/** "Needs at least N characters" when a field has some text but is below its
 *  minimum; undefined when empty (the required mark handles that) or long enough. */
function minErr(value: string, min: number): string | undefined {
  const len = value.trim().length;
  return len > 0 && len < min ? `Needs at least ${min} characters` : undefined;
}

/** "Maximum N characters" once the field is full - maxLength blocks further
 *  typing, so this tells the user why their keystroke did nothing. */
function maxNote(value: string, max: number): string | undefined {
  return value.length >= max ? `Maximum ${max} characters` : undefined;
}

// ---- stepper -----------------------------------------------------------------

const STEPS = ["Upload", "Product", "Targeting", "Outreach"];

function StepRail({
  step,
  onJump,
  locked = false,
}: {
  step: number;
  onJump: (i: number) => void;
  /** Disable jump-back while the create/upload is in flight. */
  locked?: boolean;
}) {
  return (
    <nav aria-label="Wizard steps" className="flex flex-row gap-4 lg:flex-col lg:gap-5">
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "future";
        return (
          <button
            key={label}
            type="button"
            disabled={state === "future" || locked}
            onClick={() => state === "done" && !locked && onJump(i)}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
              state === "done"
                ? "text-ink hover:text-terracotta"
                : state === "current"
                  ? "text-ink"
                  : "cursor-default text-ink-faint"
            }`}
          >
            {state === "done" ? (
              <Check aria-hidden size={13} strokeWidth={2.5} className="shrink-0" />
            ) : state === "current" ? (
              <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full bg-terracotta" />
            ) : (
              <span aria-hidden className="w-[13px] shrink-0" />
            )}
            <span>
              0{i + 1} · {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ---- page --------------------------------------------------------------------

export default function NewCampaignPage() {
  const router = useRouter();
  const { busy, run } = useAction();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [file, setFile] = useState<File | null>(null);
  // Company count from the uploaded CSV - caps "Top companies to pursue" at 15%.
  const [companyCount, setCompanyCount] = useState(0);
  // Set when createCampaign succeeded but the CSV upload failed - the retry
  // path then re-uploads to this campaign instead of creating a duplicate.
  const [orphan, setOrphan] = useState<{ id: number; name: string } | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (k: "industries" | "geographies" | "sizes" | "signals" | "ranking") => (v: string) =>
    setDraft((d) => ({
      ...d,
      [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v],
    }));

  // Min-length errors for the required free-text fields (shown only once the
  // field has some text but is still too short).
  const nameErr = minErr(draft.name, 3);
  const productErr = minErr(draft.product, 2);
  const industryErr = minErr(draft.industry, 2);
  const descErr = minErr(draft.product_description, 20);
  const icpErr = minErr(draft.icp, 20);

  // Top-N is capped at 15% of the uploaded CSV's company count (at least 1).
  const maxTop = Math.max(1, Math.floor(companyCount * 0.15));

  // CsvDrop only reports files that passed client validation, so step 1 needs
  // just "a name and an accepted file".
  const stepValid = [
    draft.name.trim().length >= 3 && file !== null,
    draft.product.trim().length >= 2 &&
      draft.product_description.trim().length >= 20 &&
      draft.industry.trim().length >= 2,
    draft.icp.trim().length >= 20 &&
      draft.industries.length > 0 &&
      draft.sizes.length > 0 &&
      draft.top_n >= 1 &&
      draft.top_n <= maxTop,
    true, // outreach prefs are all optional
  ][step];

  const finish = () => {
    if (!file) return;
    void run(
      "create",
      async () => {
        const campaign = orphan ?? (await api.createCampaign(toPayload(draft)));
        try {
          const result = await api.uploadCompanies(campaign.id, file);
          return { id: campaign.id, result };
        } catch (e) {
          setOrphan({ id: campaign.id, name: campaign.name });
          const detail = e instanceof ApiError ? e.message : "upload failed";
          throw new ApiError(
            e instanceof ApiError ? e.status : 0,
            `Campaign created, but the CSV upload failed: ${detail}`,
          );
        }
      },
      {
        success: (r) => `${r.result.added} companies added (${r.result.skipped} skipped)`,
        onDone: (r) => router.push(`/campaigns/${r.id}?fresh=1`),
      },
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <BackLink href="/campaigns" label="Back to campaigns" />
      <header>
        <h1 className="display text-3xl sm:text-4xl">New campaign</h1>
        <p className="mt-2 font-serif text-lg italic text-ink-soft">
          Targets, product, pitch. The agents take it from there.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[180px_1fr] lg:gap-10">
        <StepRail step={step} onJump={setStep} locked={busy !== null} />

        <Card className="p-6">
          {step !== 3 && (
            <p className="mb-5 text-xs text-ink-faint">
              <span aria-hidden className="text-terracotta">*</span> required
            </p>
          )}
          {step === 0 && (
            <div className="space-y-5">
              <Field label="Campaign name" htmlFor="cw-name" required error={nameErr} warn={maxNote(draft.name, 80)}>
                <Input
                  id="cw-name"
                  maxLength={80}
                  aria-invalid={nameErr ? true : undefined}
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Q3 Enterprise Push"
                  autoFocus
                />
              </Field>
              <Field
                label="Target companies (CSV)"
                required
                hint="One row per company. We read company_name (or company / name); domain, industry and country are used when present."
              >
                <CsvDrop
                  file={file}
                  onFile={(f, total) => {
                    setFile(f);
                    const count = total ?? 0;
                    setCompanyCount(count);
                    if (count > 0) {
                      const cap = Math.max(1, Math.floor(count * 0.15));
                      setDraft((d) => ({ ...d, top_n: Math.min(d.top_n || cap, cap) }));
                    }
                  }}
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <Field label="Product / service name" htmlFor="cw-product" required error={productErr} warn={maxNote(draft.product, 80)}>
                <Input
                  id="cw-product"
                  maxLength={80}
                  aria-invalid={productErr ? true : undefined}
                  value={draft.product}
                  onChange={(e) => set("product", e.target.value)}
                  placeholder="Apex Cloud Data Platform"
                />
              </Field>
              <Field
                label="Product description"
                required
                htmlFor="cw-desc"
                hint="What it does and the problem it solves, in one or two sentences."
                error={descErr}
                warn={maxNote(draft.product_description, 600)}
              >
                <Textarea
                  id="cw-desc"
                  maxLength={600}
                  aria-invalid={descErr ? true : undefined}
                  rows={3}
                  value={draft.product_description}
                  onChange={(e) => set("product_description", e.target.value)}
                  placeholder="A unified data platform that serves operational data to teams in real time, with no custom pipelines."
                />
              </Field>
              <Field label="Your industry" htmlFor="cw-industry" hint="The category your product sits in." required error={industryErr} warn={maxNote(draft.industry, 60)}>
                <Input
                  id="cw-industry"
                  maxLength={60}
                  aria-invalid={industryErr ? true : undefined}
                  value={draft.industry}
                  onChange={(e) => set("industry", e.target.value)}
                  placeholder="Data infrastructure"
                />
              </Field>
              <Field label="Value proposition" htmlFor="cw-value" hint="The outcome customers get." warn={maxNote(draft.value_proposition, 300)}>
                <Textarea
                  id="cw-value"
                  maxLength={300}
                  rows={2}
                  value={draft.value_proposition}
                  onChange={(e) => set("value_proposition", e.target.value)}
                  placeholder="Cut reporting lead time by 60% and retire 3–4 point tools."
                />
              </Field>
              <Field label="Key differentiators" htmlFor="cw-diff" warn={maxNote(draft.differentiators, 200)}>
                <Input
                  id="cw-diff"
                  maxLength={200}
                  value={draft.differentiators}
                  onChange={(e) => set("differentiators", e.target.value)}
                  placeholder="Real-time, no-pipeline setup"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Field
                label="Ideal customer profile"
                required
                htmlFor="cw-icp"
                hint="The company most likely to buy: situation, size, needs. The scoring agent judges fit against this."
                error={icpErr}
                warn={maxNote(draft.icp, 600)}
              >
                <Textarea
                  id="cw-icp"
                  maxLength={600}
                  aria-invalid={icpErr ? true : undefined}
                  rows={3}
                  value={draft.icp}
                  onChange={(e) => set("icp", e.target.value)}
                  placeholder="Mid-sized 3PL firms migrating to the cloud and growing their data teams."
                />
              </Field>
              <Field label="Target industries" hint="Pick at least one. Matching companies score higher." required>
                <Chips options={INDUSTRIES} selected={draft.industries} onToggle={toggle("industries")} />
              </Field>
              <Field label="Company size (employees)" hint="Pick at least one bracket." required>
                <Chips options={SIZES} selected={draft.sizes} onToggle={toggle("sizes")} />
              </Field>
              <Field label="Target countries" hint="Leave empty for no geographic preference.">
                <Chips options={COUNTRIES} selected={draft.geographies} onToggle={toggle("geographies")} />
              </Field>
              <Field
                label="Top companies to pursue"
                required
                htmlFor="cw-topn"
                hint={`Up to ${maxTop} — 15% of your ${companyCount} ${companyCount === 1 ? "company" : "companies"}.`}
                error={
                  draft.top_n > maxTop ? `Maximum ${maxTop} (15% of ${companyCount})` : undefined
                }
              >
                <Input
                  id="cw-topn"
                  type="number"
                  min={1}
                  max={maxTop}
                  value={draft.top_n}
                  onChange={(e) => set("top_n", e.target.valueAsNumber || 0)}
                  className="w-28"
                  aria-invalid={draft.top_n > maxTop ? true : undefined}
                />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Tone" htmlFor="cw-tone">
                  <Select id="cw-tone" value={draft.tone} onChange={(e) => set("tone", e.target.value)}>
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Personalization" htmlFor="cw-pers">
                  <Select
                    id="cw-pers"
                    value={draft.personalization_level}
                    onChange={(e) => set("personalization_level", Number(e.target.value))}
                  >
                    <option value={1}>Low: template-first</option>
                    <option value={2}>Balanced</option>
                    <option value={3}>High: researched per contact</option>
                  </Select>
                </Field>
              </div>
              <Field
                label="Email template"
                htmlFor="cw-template"
                hint="Leave blank to let the outreach agent write each email from scratch."
                warn={maxNote(draft.email_template, 4000)}
              >
                <Textarea
                  id="cw-template"
                  maxLength={4000}
                  rows={5}
                  value={draft.email_template}
                  onChange={(e) => set("email_template", e.target.value)}
                  placeholder={TEMPLATE_PLACEHOLDER}
                  className="font-mono text-xs"
                />
              </Field>
              <Field
                label="Footer / signature"
                htmlFor="cw-footer"
                hint="Appears at the bottom of every email."
                warn={maxNote(draft.footer, 500)}
              >
                <Textarea
                  id="cw-footer"
                  maxLength={500}
                  rows={4}
                  value={draft.footer}
                  onChange={(e) => set("footer", e.target.value)}
                  placeholder={FOOTER_PLACEHOLDER}
                />
              </Field>
            </div>
          )}

          {orphan && (
            <p className="mt-5 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-ink-soft">
              <strong className="font-semibold text-ink">{orphan.name}</strong> was created, but its
              companies didn’t upload. Use “Create campaign” to retry the upload (only the file is
              retried; settings changes here won’t apply to it), or{" "}
              <Link href={`/campaigns/${orphan.id}`} className="font-medium text-terracotta hover:underline">
                open the campaign
              </Link>{" "}
              and add them there.
            </p>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => (step === 0 ? router.push("/campaigns") : setStep((s) => s - 1))}
            >
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" disabled={!stepValid} onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="accent" busy={busy === "create"} disabled={!stepValid} onClick={finish}>
                Create campaign
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
