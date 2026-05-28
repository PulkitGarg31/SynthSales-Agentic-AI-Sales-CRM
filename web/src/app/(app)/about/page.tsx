import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

const features = [
  ["Automated research", "Profiles, funding, news, and hiring signals gathered for every company."],
  ["Explainable scoring", "Weighted ranking against your ICP — with the reasoning shown."],
  ["Verified outreach", "Emails guessed and verified before a single message goes out."],
  ["Human in the loop", "Approve contacts and drafts at every critical step."],
];

const team = [
  { name: "Jordan Pierce", role: "Founder & CEO", initials: "JP" },
  { name: "Sam Ortega", role: "Head of Product", initials: "SO" },
  { name: "Priya Nair", role: "Lead ML Engineer", initials: "PN" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="About Reachly" subtitle="Logistics for your sales pipeline." />

      <Card className="mb-6 overflow-hidden">
        <div className="relative bg-ink p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,rgba(240,130,75,0.4),transparent_55%)]" />
          <h2 className="relative font-display text-3xl text-white">
            Our mission
          </h2>
          <p className="relative mt-3 max-w-2xl text-white/80">
            We believe sales teams should spend their time talking to the right
            people — not hunting for them. Reachly automates the entire top of
            the funnel, from research to verified, personalized outreach, while
            keeping a human firmly in control of what gets sent.
          </p>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
        What we do
      </h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {features.map(([t, d]) => (
          <Card key={t} className="p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/25 text-ink">
              <Icon.Sparkle width={18} height={18} />
            </div>
            <h3 className="font-bold text-ink">{t}</h3>
            <p className="mt-1 text-sm text-ink-500">{d}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
        Team
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {team.map((m) => (
          <Card key={m.name} className="flex flex-col items-center p-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-xl font-bold text-brand">
              {m.initials}
            </span>
            <p className="mt-3 font-bold text-ink">{m.name}</p>
            <p className="text-sm text-ink-500">{m.role}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
