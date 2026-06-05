"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { TONES } from "@/lib/constants";

const INDUSTRIES = [
  "Aerospace & Defense", "Agriculture", "Automotive", "Banking",
  "Biotechnology", "Chemicals", "Construction", "Consulting",
  "Consumer Goods", "Cybersecurity", "E-commerce", "Education",
  "Energy", "Financial Services", "Food & Beverage", "Gaming",
  "Government / Public Sector", "Healthcare", "Hospitality",
  "Insurance", "Legal Services", "Logistics", "Manufacturing",
  "Marketing & Advertising", "Media", "Mining & Metals", "Non-Profit",
  "Pharmaceuticals", "Professional Services", "Real Estate", "Retail",
  "SaaS", "Technology", "Telecommunications", "Transportation",
  "Travel", "Utilities", "Wholesale Distribution",
];
const COUNTRIES = [
  "United States", "Canada", "Mexico", "United Kingdom", "Ireland",
  "Germany", "France", "Netherlands", "Spain", "Italy", "Sweden",
  "Denmark", "Switzerland", "Australia", "New Zealand", "Japan",
  "South Korea", "Singapore", "India", "UAE", "Saudi Arabia",
  "Israel", "Brazil", "South Africa",
];
const SIZES = ["1–50", "51–200", "201–1,000", "1,000–5,000", "5,000+"];

// Generalized buying signals + ranking criteria. We decide these so every
// campaign is judged on the full set of evidence rather than whichever
// chips the user happened to tick.
const DEFAULT_BUSINESS_REQUIREMENTS = [
  "Recent funding (Series A or later) or visible revenue growth",
  "Headcount growth in the last 6–12 months",
  "Actively hiring — especially roles adjacent to our buyer persona",
  "Cloud, data, or core-systems modernization underway",
  "Expansion into new markets, geographies, or product lines",
  "Uses a competitor product or an obvious adjacent tool",
  "Recent leadership change in the buyer's function",
  "Recent M&A, partnership, or rebrand activity",
  "Compliance, regulatory, or audit deadline forcing change",
  "Public engineering / product / careers content signalling investment in this area",
].join("; ");

const DEFAULT_RANKING_CRITERIA = [
  "Product fit — how directly our product solves their stated pain",
  "Industry alignment with the configured target industries",
  "Company size match with the configured size brackets",
  "Geography match with the configured target countries",
  "Growth indicators (headcount, revenue, market expansion)",
  "Recent funding or financial events",
  "Hiring activity in buyer or end-user roles",
  "Tech-stack overlap with our product or its integrations",
  "Buyer accessibility — decision makers visible on LinkedIn",
  "Recency of relevant trigger events or news",
].join("; ");

const stepTitles = ["Upload companies", "Product details", "Target requirements", "Outreach settings"];

const SAMPLE_CSV =
  "company_name,domain,industry,country\nNorthwind Logistics,northwind.com,Logistics,US\nBrightwave Manufacturing,brightwave.io,Manufacturing,US\n";

const FOOTER_EXAMPLE = `Jordan Pierce
Account Executive · Apex Cloud
jordan@apexcloud.com · +1 (415) 555-0142
apexcloud.com`;

interface Form {
  name: string;
  product: string;
  product_description: string;
  value_proposition: string;
  industry: string;
  differentiators: string;
  icp: string;
  industries: string[];
  countries: string[];
  sizes: string[];
  top_n: number;
  email_template: string;
  footer: string;
  tone: string;
  personalization_level: number;
}

const initial: Form = {
  name: "",
  product: "",
  product_description: "",
  value_proposition: "",
  industry: "",
  differentiators: "",
  icp: "",
  industries: [],
  countries: [],
  sizes: [],
  top_n: 3,
  email_template: "",
  footer: "",
  tone: "professional",
  personalization_level: 2,
};

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [companyCount, setCompanyCount] = useState(0);
  const [valid, setValid] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "industries" | "countries" | "sizes", v: string) =>
    setForm((f) => ({
      ...f,
      [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v],
    }));

  // Top-N bounds: min 2, max = max(10% of CSV, 3), capped at company count.
  const maxTopN = useMemo(() => {
    const tenPct = Math.ceil(companyCount * 0.1);
    const upper = Math.max(tenPct, 3);
    return companyCount > 0 ? Math.min(companyCount, upper) : 3;
  }, [companyCount]);
  const clampTopN = (n: number) => Math.min(Math.max(n, 2), maxTopN);

  async function onFile(f: File) {
    setFile(f);
    const isCsv = f.name.toLowerCase().endsWith(".csv");
    setValid(isCsv);
    if (!isCsv) return;
    try {
      const text = await f.text();
      const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const count = Math.max(0, rows.length - 1); // minus header
      setCompanyCount(count);
      // Default Top N to the new max.
      const tenPct = Math.ceil(count * 0.1);
      const upper = count > 0 ? Math.min(count, Math.max(tenPct, 3)) : 3;
      set("top_n", Math.min(Math.max(upper, 2), upper));
    } catch {
      setCompanyCount(0);
    }
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!form.name.trim()) return "Campaign name is required.";
      if (!file) return "Please upload a CSV of target companies.";
      if (valid === false) return "Please upload a valid .csv file.";
    }
    if (step === 1) {
      if (!form.product.trim()) return "Product / service name is required.";
      if (!form.product_description.trim()) return "Product description is required.";
      if (!form.industry.trim()) return "Industry category is required.";
    }
    if (step === 2) {
      if (!form.icp.trim()) return "Ideal customer profile is required.";
      if (form.industries.length === 0) return "Pick at least one target industry.";
      if (form.sizes.length === 0) return "Pick at least one company size.";
    }
    return null;
  }

  async function next() {
    const v = validateStep();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    if (step < stepTitles.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    setBusy(true);
    try {
      const campaign = await api.createCampaign({
        name: form.name.trim(),
        product: form.product,
        product_description: form.product_description,
        value_proposition: form.value_proposition,
        industry: form.industry,
        differentiators: form.differentiators,
        icp: form.icp,
        industry_pref: form.industries.join(", "),
        geography: form.countries.join(", "),
        company_size: form.sizes.join(", "),
        business_requirements: DEFAULT_BUSINESS_REQUIREMENTS,
        ranking_criteria: DEFAULT_RANKING_CRITERIA,
        top_n: clampTopN(form.top_n),
        email_template: form.email_template,
        footer: form.footer,
        tone: form.tone,
        personalization_level: form.personalization_level,
      });
      if (file) {
        await api.uploadCompanies(campaign.id, file);
        await api.runCampaign(campaign.id);
      }
      router.push(`/research?campaign=${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
      setBusy(false);
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-companies.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New campaign"
        subtitle="Set up your targets, product, and outreach style. The agents take it from here."
      />

      <ol className="mb-6 flex items-center gap-2">
        {stepTitles.map((t, i) => (
          <li key={t} className="flex flex-1 items-center gap-2">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              i < step ? "bg-ok text-white" : i === step ? "bg-brand text-ink" : "bg-ink/10 text-ink-500"
            }`}>
              {i < step ? <Icon.Check width={16} height={16} /> : i + 1}
            </div>
            <span className={`hidden text-sm font-semibold sm:block ${i === step ? "text-ink" : "text-ink-500"}`}>{t}</span>
            {i < stepTitles.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-line sm:block" />}
          </li>
        ))}
      </ol>

      <Card className="p-6">
        {step === 0 && (
          <div>
            <h2 className="text-lg font-bold text-ink">Upload target companies<span className="ml-0.5 text-danger">*</span></h2>
            <p className="mt-1 text-sm text-ink-500">A CSV of the companies you want to target is required to run the pipeline.</p>

            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Campaign name<span className="ml-0.5 text-danger">*</span>
              </label>
              <input className="form-input" placeholder="Q3 Enterprise Push" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>

            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-peach-soft/60 px-6 py-10 text-center transition-colors hover:border-brand-600">
              <Icon.Upload width={28} height={28} className="text-ink-500" />
              <span className="mt-3 text-sm font-semibold text-ink">{file ? file.name : "Drop your CSV here or click to browse"}</span>
              <span className="mt-1 text-xs text-ink-300">Required columns: company_name, domain</span>
              <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </label>

            {valid === true && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
                <Icon.Check width={16} height={16} /> {companyCount} companies detected.
              </div>
            )}
            {valid === false && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                <Icon.Info width={16} height={16} /> Please upload a .csv file.
              </div>
            )}

            <button onClick={downloadSample} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-info hover:underline">
              <Icon.Logs width={16} height={16} /> Download sample CSV
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-ink">Product details</h2>
            <Field label="Product / service name" required>
              <input className="form-input" placeholder="Apex Cloud Data Platform" value={form.product} onChange={(e) => set("product", e.target.value)} />
            </Field>
            <Field label="Product description" required hint="What it does and the problem it solves — 1–2 sentences.">
              <textarea rows={3} className="form-input" placeholder="A unified data platform that serves operational data to teams in real time, with no custom pipelines." value={form.product_description} onChange={(e) => set("product_description", e.target.value)} />
            </Field>
            <Field label="Value proposition" hint="The outcome customers get.">
              <textarea rows={2} className="form-input" placeholder="Cut reporting lead time by 60% and retire 3–4 point tools." value={form.value_proposition} onChange={(e) => set("value_proposition", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Industry category" required>
                <input className="form-input" placeholder="Data infrastructure" value={form.industry} onChange={(e) => set("industry", e.target.value)} />
              </Field>
              <Field label="Key differentiators">
                <input className="form-input" placeholder="Real-time, no-pipeline setup" value={form.differentiators} onChange={(e) => set("differentiators", e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-ink">Target customer requirements</h2>

            <Field
              label="Ideal customer profile (ICP)"
              required
              hint="A short description of the company most likely to buy — their situation, size, and needs. The AI uses it to judge fit. Example: “Mid-sized 3PL firms migrating to the cloud and growing their data teams.”"
            >
              <textarea rows={3} className="form-input" placeholder="Describe the kind of company that's the best fit…" value={form.icp} onChange={(e) => set("icp", e.target.value)} />
            </Field>

            <Field label="Target industries" required hint="Pick one or more. Matching companies score higher.">
              <ChipMulti options={INDUSTRIES} selected={form.industries} onToggle={(v) => toggle("industries", v)} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Target countries" hint="Optional — leave empty for no geographic preference.">
                <ChipMulti options={COUNTRIES} selected={form.countries} onToggle={(v) => toggle("countries", v)} />
              </Field>
              <Field label="Company size (employees)" required>
                <ChipMulti options={SIZES} selected={form.sizes} onToggle={(v) => toggle("sizes", v)} />
              </Field>
            </div>

            <Field
              label="How many top companies to pursue?"
              hint={
                companyCount > 0
                  ? `Between 2 and ${maxTopN} — the top 10% of your ${companyCount} companies (at least 3).`
                  : "Upload a CSV first to set the range (2–3 until then)."
              }
            >
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => set("top_n", clampTopN(form.top_n - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink hover:bg-ink/5 disabled:opacity-40" disabled={clampTopN(form.top_n) <= 2}>–</button>
                <span className="w-12 text-center font-display text-2xl text-ink">{clampTopN(form.top_n)}</span>
                <button type="button" onClick={() => set("top_n", clampTopN(form.top_n + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink hover:bg-ink/5 disabled:opacity-40" disabled={clampTopN(form.top_n) >= maxTopN}>+</button>
                <span className="text-xs text-ink-300">max {maxTopN}</span>
              </div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-ink">Outreach settings</h2>
            <Field label="Email template (optional)" hint="Leave blank to let AI write each email from scratch.">
              <textarea rows={4} className="form-input font-mono text-xs" placeholder={"Hi {{first_name}},\n\n{{personalized_intro}}\n\n{{value_prop}}\n\nBest,\n{{sender}}"} value={form.email_template} onChange={(e) => set("email_template", e.target.value)} />
            </Field>
            <Field label="Email footer / signature" hint="Appears at the bottom of every email. Keep it clean and professional.">
              <textarea rows={4} className="form-input" placeholder={FOOTER_EXAMPLE} value={form.footer} onChange={(e) => set("footer", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tone preference">
                <div className="flex flex-wrap gap-2">
                  {TONES.map((t) => (
                    <button key={t.value} type="button" onClick={() => set("tone", t.value)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${form.tone === t.value ? "bg-ink text-white" : "bg-ink/5 text-ink-500 hover:bg-ink/10"}`}>{t.label}</button>
                  ))}
                </div>
              </Field>
              <Field label={`Personalization level: ${["Low", "Balanced", "High"][form.personalization_level - 1]}`}>
                <input type="range" min={1} max={3} value={form.personalization_level} onChange={(e) => set("personalization_level", Number(e.target.value))} className="w-full accent-[var(--color-brand-600)]" />
              </Field>
            </div>
          </div>
        )}

        {error && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" onClick={() => (step === 0 ? router.back() : (setError(null), setStep((s) => s - 1)))} disabled={busy}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <Button onClick={next} disabled={busy}>
            {step === stepTitles.length - 1 ? (
              busy ? "Launching…" : <><Icon.Sparkle width={16} height={16} /> Launch campaign</>
            ) : (
              <>Continue <Icon.Arrow width={16} height={16} /></>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {hint && <p className="mb-2 text-xs leading-relaxed text-ink-500">{hint}</p>}
      {children}
    </div>
  );
}

function ChipMulti({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              on ? "bg-ink text-white" : "bg-ink/5 text-ink-500 ring-1 ring-inset ring-line hover:bg-ink/10"
            }`}
          >
            {on && <Icon.Check width={13} height={13} />}
            {o}
          </button>
        );
      })}
    </div>
  );
}
