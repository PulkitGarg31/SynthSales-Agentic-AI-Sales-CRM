import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { AGENT_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "About" };

// One truthful line per agent, in pipeline order. Labels come from the shared
// AGENT_LABELS map so marketing and app UI never drift apart.
const CREW: readonly { key: string; duty: string }[] = [
  {
    key: "enrichment",
    duty:
      "Reads each company’s own site and public footprint, and flags parked or dead domains instead of inventing a profile.",
  },
  {
    key: "scoring",
    duty:
      "Ranks every company against your product and ideal customer. Thin evidence caps the score, so a ghost can’t look like a strong match.",
  },
  {
    key: "employee_finder",
    duty:
      "Surfaces real LinkedIn profiles of commercial decision makers, or returns zero. Names are never made up.",
  },
  {
    key: "email_guess_verification",
    duty:
      "Guesses likely address patterns and confirms them against the mail server; on a catch-all, the best guess is kept and clearly labeled Risky.",
  },
  {
    key: "outreach",
    duty:
      "Drafts a first email grounded in the research on that specific company, not boilerplate with a name swapped in.",
  },
  {
    key: "tracking",
    duty:
      "Nudges quiet threads up to three times, then marks them stalled and leaves them alone.",
  },
  {
    key: "meeting",
    duty:
      "Books a real Google Calendar event with a Google Meet link on your own calendar when a prospect is ready.",
  },
  {
    key: "reply_classifier",
    duty:
      "Reads inbound replies, classifies the intent, and opts out anyone who clearly says no, for good.",
  },
] as const;

const PRINCIPLES = [
  {
    title: "Never fabricate",
    body:
      "Zero contacts beats invented ones. A dead domain is reported as dead, an unverifiable email stays blank, and no agent ever fills a gap with fiction.",
  },
  {
    title: "Degrade gracefully",
    body:
      "Every external integration is optional. A missing key means an honest blank and a deterministic fallback, never a fake result pretending the service answered.",
  },
  {
    title: "A human approves every send",
    body:
      "Outbound email ships disabled. Drafts queue for review, follow-ups respect the kill-switch, and nothing reaches a prospect without your go-ahead.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-3xl px-6 pb-16 pt-20 md:pt-28">
        <div className="space-y-4">
          <Eyebrow>About Sellari</Eyebrow>
          <h1 className="display text-4xl md:text-5xl">
            Outreach, done <em>carefully</em>.
          </h1>
        </div>
        <p className="mt-8 text-base leading-relaxed text-ink-soft md:text-lg">
          Sellari exists because most cold outreach is careless: scraped lists, guessed emails,
          templates with a first name bolted on. We built the opposite: a pipeline of eight agents
          that actually reads each company, finds the real people, confirms how to reach them, and
          writes something worth replying to. Then it stops and waits for you.
        </p>
        <p className="mt-8 border-l-2 border-terracotta pl-6 font-serif text-2xl italic leading-snug text-ink md:text-3xl">
          The fastest way to earn a reply is to deserve one.
        </p>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
          <div className="max-w-2xl space-y-4">
            <Eyebrow index="01">The crew</Eyebrow>
            <h2 className="display text-3xl md:text-4xl">
              Eight agents, <em>one</em> pipeline.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CREW.map((agent, i) => (
              <div key={agent.key} className="rounded-2xl border border-line bg-paper p-6">
                <p className="font-mono text-xs text-ink-faint">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 text-base font-semibold tracking-tight text-ink">
                  {AGENT_LABELS[agent.key]}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{agent.duty}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto w-full max-w-3xl px-6 py-20 md:py-24">
          <div className="space-y-4">
            <Eyebrow index="02">Principles</Eyebrow>
            <h2 className="display text-3xl md:text-4xl">
              What we <em>refuse</em> to automate away.
            </h2>
          </div>
          <ul className="mt-10">
            {PRINCIPLES.map((principle) => (
              <li key={principle.title} className="border-b border-line py-6 first:border-t">
                <h3 className="text-base font-semibold tracking-tight text-ink">
                  {principle.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{principle.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
