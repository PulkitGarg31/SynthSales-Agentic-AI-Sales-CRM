import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/icons";

/* -------------------------------------------------------------------------- */
/*  Reachly landing page                                                      */
/*  Sections:                                                                 */
/*    1. Hero (dark block, yellow accent)                                     */
/*    2. Trusted-by / integrations row                                        */
/*    3. How it works — visual 8-step pipeline                                */
/*    4. Features grid                                                        */
/*    5. Product showcase — auto-scrolling carousel (pure CSS marquee)        */
/*    6. FAQ                                                                  */
/*    7. Final CTA band                                                       */
/*    8. Footer                                                               */
/* -------------------------------------------------------------------------- */

const pipeline: { label: string; icon: keyof typeof Icon; blurb: string }[] = [
  { label: "Upload",       icon: "Upload",   blurb: "Drop a CSV of target companies." },
  { label: "Research",     icon: "Research", blurb: "AI gathers profile, news, hiring." },
  { label: "Score",        icon: "Sparkle",  blurb: "Weighted match against your ICP." },
  { label: "Discover",     icon: "Contacts", blurb: "Find the right decision-makers." },
  { label: "Verify",       icon: "Check",    blurb: "Real-time mailbox verification." },
  { label: "Outreach",     icon: "Mail",     blurb: "Personalized email per contact." },
  { label: "Follow-up",    icon: "Chat",     blurb: "Contextual nudges until they reply." },
  { label: "Meeting",      icon: "Calendar", blurb: "Calendar booked, deal in motion." },
];

const integrations = [
  "Gmail SMTP",
  "PostgreSQL",
  "Google Gemini",
  "Groq",
  "OpenRouter",
  "ZeroBounce",
  "DuckDuckGo",
  "APScheduler",
];

const features: { title: string; desc: string; icon: keyof typeof Icon }[] = [
  {
    title: "Company Research",
    desc: "Profiles, industry, size, funding, news, and hiring signals — gathered automatically from open web sources.",
    icon: "Research",
  },
  {
    title: "Explainable Scoring",
    desc: "Weighted scores against your ICP with a per-factor breakdown for every company — never a black box.",
    icon: "Sparkle",
  },
  {
    title: "Contact Discovery",
    desc: "Top decision-makers per company with role, seniority, and LinkedIn context — no guessing who to email.",
    icon: "Contacts",
  },
  {
    title: "Email Verification",
    desc: "Free syntax + MX layer catches dead domains; ZeroBounce confirms the survivors before a single send.",
    icon: "Check",
  },
  {
    title: "Personalized Outreach",
    desc: "AI-written subject + body tuned to role, company research, and your tone — reviewed and approved by you.",
    icon: "Mail",
  },
  {
    title: "Follow-up Automation",
    desc: "Inbox monitored on a schedule with contextual nudges that escalate until a meeting is booked.",
    icon: "Chat",
  },
];

const faqs = [
  {
    q: "How is Reachly different from Apollo or Outreach?",
    a: "Reachly runs an end-to-end agent pipeline — research, scoring, contact discovery, verification, writing, and follow-up — instead of selling each step as a separate tool. The AI explains its scoring and you approve every send.",
  },
  {
    q: "Do you train AI models on my data?",
    a: "No. Your CSVs, research, and conversations stay in your database. AI providers see only the per-call prompt and the response — nothing is retained for training.",
  },
  {
    q: "Which AI providers can I use?",
    a: "Google Gemini, Groq (Llama 3.3 70B), and OpenRouter are wired in with automatic failover on rate-limit errors. Bring your own keys; the free tiers cover most use cases.",
  },
  {
    q: "What about email sending?",
    a: "Gmail SMTP works out of the box. Outbound is paused by default — no email goes to a prospect until you flip the switch in Settings, so you can test the pipeline risk-free.",
  },
  {
    q: "Is email verification real?",
    a: "Yes. A free local layer (syntax + DNS MX lookup + role/disposable detection) filters obvious bad addresses, and ZeroBounce confirms the survivors.",
  },
  {
    q: "Can I review emails before they send?",
    a: "Every draft lands in the Email Review queue. Edit, regenerate with AI, send a test to yourself, or approve & send — you stay in the loop on every outbound message.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-peach">
      <HeroBlock />
      <IntegrationsRow />
      <HowItWorks />
      <FeaturesGrid />
      <ProductCarousel />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------- HERO */
function HeroBlock() {
  return (
    <div className="p-3 sm:p-5">
      <div className="relative overflow-hidden rounded-[28px] bg-ink">
        {/* Warm gradient wash echoing the reference hero. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_10%,rgba(240,130,75,0.45),transparent_55%),radial-gradient(90%_70%_at_90%_0%,rgba(255,212,0,0.25),transparent_50%)]" />

        {/* Nav */}
        <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-10">
          <Logo variant="light" />
          <nav className="hidden items-center gap-8 text-sm font-medium text-white/80 md:flex">
            <a href="#workflow" className="hover:text-brand">How it works</a>
            <a href="#features" className="hover:text-brand">Features</a>
            <a href="#showcase" className="hover:text-brand">Product</a>
            <a href="#faq" className="hover:text-brand">FAQ</a>
            <Link href="/about" className="hover:text-brand">Company</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-ink hover:bg-brand-600"
            >
              Get started
            </Link>
          </div>
        </header>

        {/* Hero body */}
        <div className="relative z-10 grid items-center gap-10 px-5 pb-14 pt-6 sm:px-10 lg:grid-cols-[1.15fr_0.85fr] lg:pb-24 lg:pt-12">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand ring-1 ring-inset ring-white/15">
              <Icon.Sparkle width={14} height={14} /> AI Sales Outreach
            </p>
            <h1 className="font-display text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.95] text-white">
              Beyond
              <br />
              <span className="text-brand">cold</span> outreach
              <br />
              <span className="text-white/40">and</span> guesswork
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/75">
              Reachly researches your target companies, scores them against your
              ideal customer profile, finds the decision-makers, verifies their
              emails, and runs personalized outreach with automated follow-ups —
              end to end, with you in control.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-3 rounded-full bg-brand py-3 pl-6 pr-3 text-base font-bold text-ink transition-colors hover:bg-brand-600"
              >
                Start free
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-brand transition-transform group-hover:translate-x-0.5">
                  <Icon.ArrowUpRight width={18} height={18} />
                </span>
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full px-5 py-3 text-base font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10"
              >
                View demo dashboard
              </Link>
            </div>

            <div className="mt-10 flex items-center gap-6">
              <div className="flex items-end gap-2.5">
                <span className="font-display text-4xl leading-none text-brand">3M+</span>
                <span className="max-w-[10rem] text-xs leading-tight text-white/65">
                  personalized emails sent without lifting a finger
                </span>
              </div>
              <span className="h-10 w-px bg-white/15" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Trusted by SDR teams
                </p>
                <div className="mt-1.5 flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="h-7 w-7 rounded-full border-2 border-ink bg-gradient-to-br from-brand/80 to-accent ring-1 ring-white/10"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right column: pipeline preview panel */}
          <div className="rounded-3xl bg-white/[0.04] p-6 ring-1 ring-inset ring-white/10 backdrop-blur sm:p-7">
            <p className="font-display text-2xl leading-tight text-white">
              Outreach shaped by data
              <br />
              <span className="text-brand">powered by AI agents</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Seven specialized agents run your pipeline sequentially — with a
              human review layer at every critical step.
            </p>

            <div className="mt-6 flex flex-wrap gap-1.5">
              {["Research", "Scoring", "Discovery", "Verification", "Outreach", "Follow-up", "Meeting"].map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-ink/60 px-2.5 py-1 text-[11px] font-semibold text-white/85 ring-1 ring-inset ring-white/10"
                >
                  {s}
                </span>
              ))}
            </div>

            <div className="mt-7 grid grid-cols-3 gap-3">
              {[
                ["94%", "ICP match accuracy"],
                ["15 min", "follow-up cadence"],
                ["7", "AI agents"],
              ].map(([n, l]) => (
                <div
                  key={l}
                  className="rounded-2xl bg-ink/50 p-3.5 ring-1 ring-inset ring-white/5"
                >
                  <div className="font-display text-2xl leading-none text-brand">{n}</div>
                  <div className="mt-1.5 text-[11px] leading-tight text-white/60">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------- INTEGRATIONS ROW */
function IntegrationsRow() {
  return (
    <section className="border-y border-ink/10 bg-cream py-8">
      <div className="mx-auto max-w-6xl px-5">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-ink/55">
          Built on top of the stack you already trust
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {integrations.map((name) => (
            <span
              key={name}
              className="font-display text-base text-ink/70 tracking-tight"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- HOW IT WORKS */
function HowItWorks() {
  return (
    <section id="workflow" className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
      <div className="max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
          How it works
        </p>
        <h2 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
          One pipeline. Seven agents. Zero busywork.
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">
          Each stage hands off to the next automatically. You only step in at
          the review checkpoints — approve contacts, edit drafts, send.
        </p>
      </div>

      {/* Pipeline visual */}
      <div className="mt-14 relative">
        {/* Dashed connector line behind the steps (desktop only) */}
        <div className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px bg-[repeating-linear-gradient(to_right,rgba(14,42,51,0.18)_0_6px,transparent_6px_12px)] lg:block" />
        <ol className="relative grid gap-y-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-6">
          {pipeline.map((step, i) => {
            const IconC = Icon[step.icon];
            return (
              <li key={step.label} className="relative">
                <div className="flex items-start gap-4 lg:flex-col lg:items-center lg:text-center">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-brand ring-4 ring-peach">
                    <IconC width={22} height={22} />
                    <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-ink ring-2 ring-peach">
                      {i + 1}
                    </span>
                  </div>
                  <div className="lg:mt-4">
                    <h3 className="font-display text-lg text-ink">{step.label}</h3>
                    <p className="mt-1 max-w-[16rem] text-sm leading-relaxed text-ink-500 lg:mx-auto">
                      {step.blurb}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- FEATURES GRID */
function FeaturesGrid() {
  return (
    <section id="features" className="bg-cream py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
              Capabilities
            </p>
            <h2 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
              One platform, the whole funnel.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-500">
              Each capability is a standalone agent — usable on its own, stronger together.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-ink/90"
          >
            Open the dashboard <Icon.ArrowUpRight width={16} height={16} />
          </Link>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const IconC = Icon[f.icon];
            return (
              <article
                key={f.title}
                className="group relative overflow-hidden rounded-3xl border border-ink/8 bg-surface p-6 transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(14,42,51,0.18)]"
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/25 text-ink ring-1 ring-inset ring-brand/40">
                  <IconC width={22} height={22} />
                </div>
                <h3 className="font-display text-xl text-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.desc}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------- PRODUCT CAROUSEL (CSS) */
function ProductCarousel() {
  // The marquee is a single track duplicated; the @keyframes shifts it by 50%
  // (one full set width) for a seamless loop. Defined inline below — no client JS.
  const slides = [
    { title: "Dashboard", node: <MockDashboard /> },
    { title: "Campaign builder", node: <MockCampaign /> },
    { title: "Research & ranking", node: <MockResearch /> },
    { title: "Email review", node: <MockEmail /> },
    { title: "Conversations", node: <MockConversations /> },
    { title: "Agents", node: <MockAgents /> },
  ];

  return (
    <section id="showcase" className="overflow-hidden py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">
            See it in action
          </p>
          <h2 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
            Every step has a screen built for it.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-500">
            From CSV upload to a booked meeting — designed to keep humans in the loop.
          </p>
        </div>
      </div>

      <div className="reachly-marquee relative mt-12 select-none">
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-peach to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-peach to-transparent" />

        <div className="reachly-marquee-track flex w-max gap-6 px-6">
          {[...slides, ...slides].map((s, i) => (
            <figure
              key={`${s.title}-${i}`}
              className="w-[460px] shrink-0 overflow-hidden rounded-2xl bg-surface shadow-[0_18px_60px_-20px_rgba(14,42,51,0.35)] ring-1 ring-ink/10"
              aria-hidden={i >= slides.length}
            >
              <div className="flex items-center gap-1.5 border-b border-line bg-cream px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
                <span className="ml-3 text-[11px] font-semibold uppercase tracking-wider text-ink/45">
                  {s.title}
                </span>
              </div>
              <div className="h-[280px] bg-canvas p-4">{s.node}</div>
            </figure>
          ))}
        </div>

        {/* Pure-CSS marquee — pauses on hover, disabled under reduced motion */}
        <style>{`
          .reachly-marquee-track {
            animation: reachly-scroll 55s linear infinite;
          }
          .reachly-marquee:hover .reachly-marquee-track { animation-play-state: paused; }
          @keyframes reachly-scroll {
            from { transform: translate3d(0, 0, 0); }
            to   { transform: translate3d(-50%, 0, 0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .reachly-marquee-track { animation: none; }
          }
        `}</style>
      </div>
    </section>
  );
}

/* ----------------------------- Stylised product "screenshots" (no images) */
function MockBar({ w, tone = "neutral" }: { w: string; tone?: "neutral" | "brand" | "accent" }) {
  const toneCls =
    tone === "brand" ? "bg-brand/70" : tone === "accent" ? "bg-accent/70" : "bg-ink/15";
  return <span className={`block h-2 rounded-full ${toneCls}`} style={{ width: w }} />;
}

function MockCard({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-3 ${className}`}>{children}</div>
  );
}

function MockDashboard() {
  return (
    <div className="grid h-full grid-cols-3 gap-3">
      {[
        ["Companies", "152", "brand"],
        ["Emails sent", "1.2k", "accent"],
        ["Replies", "184", "brand"],
      ].map(([l, n, t]) => (
        <MockCard key={l} className="flex flex-col justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/45">{l}</span>
          <span className={`font-display text-2xl ${t === "brand" ? "text-ink" : "text-accent"}`}>{n}</span>
        </MockCard>
      ))}
      <MockCard className="col-span-2 row-span-1 flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/45">Pipeline</span>
        <div className="flex items-end gap-1.5">
          {[40, 60, 80, 55, 92, 45, 70].map((h, i) => (
            <span key={i} className={`w-4 rounded-sm ${i % 2 ? "bg-brand" : "bg-ink/70"}`} style={{ height: `${h}%` }} />
          ))}
        </div>
      </MockCard>
      <MockCard className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/45">Match</span>
        <span className="font-display text-2xl text-ink">94%</span>
        <MockBar w="80%" tone="brand" />
      </MockCard>
    </div>
  );
}

function MockCampaign() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i === 2 ? "bg-brand text-ink" : "bg-ink/10 text-ink/50"}`}>{i}</span>
            {i < 4 && <span className="h-px w-6 bg-ink/15" />}
          </div>
        ))}
      </div>
      <MockCard className="flex-1 space-y-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/45">Product details</span>
        <MockBar w="90%" />
        <MockBar w="72%" />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {["Logistics", "Manufacturing", "Retail", "Healthcare"].map((t) => (
            <span key={t} className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-ink/70">{t}</span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["United States", "Canada", "Germany"].map((t) => (
            <span key={t} className="rounded-full bg-brand/30 px-2 py-0.5 text-[10px] font-semibold text-ink">{t}</span>
          ))}
        </div>
      </MockCard>
    </div>
  );
}

function MockResearch() {
  return (
    <div className="flex h-full flex-col gap-2">
      {[
        { co: "Cobalt Software", ind: "Technology", s: 99, m: "Strong" },
        { co: "Atlas Cargo Group", ind: "Logistics", s: 90, m: "Strong" },
        { co: "Quantum Robotics", ind: "Manufacturing", s: 87, m: "Strong" },
        { co: "Harvest Supply Chain", ind: "Logistics", s: 80, m: "Good" },
        { co: "Orbit Media Holdings", ind: "Media", s: 78, m: "Good" },
      ].map((r, i) => (
        <div key={r.co} className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink/8 text-[10px] font-bold text-ink/70">{i + 1}</span>
          <div>
            <p className="font-semibold text-ink">{r.co}</p>
            <p className="text-ink/45">{r.ind}</p>
          </div>
          <span className={`font-display text-base ${r.s >= 85 ? "text-ok" : "text-info"}`}>{r.s}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.s >= 85 ? "bg-ok/15 text-ok" : "bg-info/15 text-info"}`}>{r.m}</span>
        </div>
      ))}
    </div>
  );
}

function MockEmail() {
  return (
    <div className="grid h-full grid-cols-[120px_1fr] gap-3">
      <div className="space-y-1.5">
        {["Dana Wu", "Erik Larsen", "Priya Shah", "Marco Diaz"].map((n, i) => (
          <div key={n} className={`rounded-lg px-2 py-1.5 text-[11px] ${i === 0 ? "bg-brand/20 ring-1 ring-inset ring-brand/40" : "bg-ink/5"}`}>
            <p className="font-semibold text-ink">{n}</p>
            <p className="truncate text-[10px] text-ink/45">A quick idea for Apex…</p>
          </div>
        ))}
      </div>
      <MockCard className="space-y-2">
        <MockBar w="55%" />
        <MockBar w="92%" />
        <MockBar w="80%" />
        <MockBar w="70%" />
        <MockBar w="88%" />
        <div className="!mt-3 flex gap-1.5">
          <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold text-white">Approve &amp; send</span>
          <span className="rounded-full bg-ink/5 px-2.5 py-1 text-[10px] font-semibold text-ink/70">Regenerate</span>
        </div>
      </MockCard>
    </div>
  );
}

function MockConversations() {
  return (
    <div className="space-y-2">
      {[
        { who: "Dana Wu", co: "Cobalt Software", stage: "Replied", tone: "ok" },
        { who: "Erik Larsen", co: "Atlas Cargo", stage: "Negotiating", tone: "info" },
        { who: "Priya Shah", co: "Quantum Robotics", stage: "Meeting", tone: "brand" },
        { who: "Marco Diaz", co: "Harvest Supply", stage: "Contacted", tone: "neutral" },
      ].map((t) => {
        const tone =
          t.tone === "ok"
            ? "bg-ok/15 text-ok"
            : t.tone === "info"
            ? "bg-info/15 text-info"
            : t.tone === "brand"
            ? "bg-brand/40 text-ink"
            : "bg-ink/8 text-ink/60";
        return (
          <div key={t.who} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-[11px]">
            <div>
              <p className="font-semibold text-ink">{t.who}</p>
              <p className="text-ink/45">{t.co}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{t.stage}</span>
          </div>
        );
      })}
    </div>
  );
}

function MockAgents() {
  return (
    <div className="grid h-full grid-cols-2 gap-2">
      {[
        ["Research", "Idle"],
        ["Scoring", "Running"],
        ["Discovery", "Idle"],
        ["Verification", "Running"],
        ["Outreach", "Idle"],
        ["Follow-up", "Idle"],
      ].map(([n, st]) => (
        <div key={n} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-[11px]">
          <span className="font-semibold text-ink">{n}</span>
          <span className={`flex items-center gap-1.5 text-[10px] font-semibold ${st === "Running" ? "text-ok" : "text-ink/50"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st === "Running" ? "bg-ok animate-pulse" : "bg-ink/30"}`} />
            {st}
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- FAQ */
function Faq() {
  return (
    <section id="faq" className="bg-cream py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-5">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">FAQ</p>
          <h2 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
            Questions, answered straight.
          </h2>
        </div>

        <div className="mt-12 divide-y divide-ink/10 overflow-hidden rounded-3xl border border-ink/10 bg-surface">
          {faqs.map((f, i) => (
            <details key={f.q} className="group" {...(i === 0 ? { open: true } : {})}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left font-display text-lg text-ink hover:bg-cream/60">
                {f.q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink-500 transition-transform group-open:rotate-45">
                  <Icon.Plus width={16} height={16} />
                </span>
              </summary>
              <div className="px-6 pb-5 text-sm leading-relaxed text-ink-500">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- FINAL CTA */
function FinalCta() {
  return (
    <section className="px-3 pb-8 sm:px-5">
      <div className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-16 text-center sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_50%_0%,rgba(255,212,0,0.22),transparent_60%)]" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
            Start filling your pipeline
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl font-display text-[clamp(2.2rem,5vw,4rem)] leading-[1] text-white">
            Your next meeting is{" "}
            <span className="text-brand">seven agents away.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/70">
            Spin up your first campaign in minutes. No credit card. Outbound stays paused
            until you flip the switch.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-3 rounded-full bg-brand py-3 pl-6 pr-3 text-base font-bold text-ink hover:bg-brand-600"
            >
              Create your account
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-brand transition-transform group-hover:translate-x-0.5">
                <Icon.ArrowUpRight width={18} height={18} />
              </span>
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full px-5 py-3 text-base font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10"
            >
              Try the live demo
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- FOOTER */
function Footer() {
  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: "Product",
      links: [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Campaigns", href: "/campaigns" },
        { label: "Research", href: "/research" },
        { label: "Email review", href: "/email-review" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "How it works", href: "#workflow" },
        { label: "Features", href: "#features" },
        { label: "FAQ", href: "#faq" },
        { label: "Logs", href: "/logs" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
        { label: "Integrations", href: "/integrations" },
        { label: "Billing", href: "/billing" },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "Sign in", href: "/login" },
        { label: "Sign up", href: "/signup" },
        { label: "Settings", href: "/settings" },
      ],
    },
  ];

  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo variant="light" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
              AI-powered B2B outreach & lead generation — research, score, find, verify,
              write, follow up, book.
            </p>
            <p className="mt-6 text-xs text-white/40">
              © {new Date().getFullYear()} Reachly. All rights reserved.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">
                {c.title}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-white/80 hover:text-brand">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40">
          <p>Built with FastAPI, Next.js, PostgreSQL, and a stack of friendly AI agents.</p>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-brand">Privacy</a>
            <a href="#" className="hover:text-brand">Terms</a>
            <a href="#" className="hover:text-brand">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
