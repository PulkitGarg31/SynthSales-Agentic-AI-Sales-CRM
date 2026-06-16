import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = { title: "Documentation" };

const STEPS = [
  {
    title: "Create a campaign",
    body:
      "Sign up, click New campaign, and walk the four steps: upload a CSV of target companies, describe your product, define your ideal customer, and set the outreach tone. A sample CSV is available in the wizard.",
  },
  {
    title: "Run the pipeline",
    body:
      "Hit Run all agents on the campaign page. SynthSales researches every company, scores the fit, finds decision makers, and verifies their emails. Watch the timeline update live as each stage finishes.",
  },
  {
    title: "Review the research",
    body:
      "Open Research to see ranked companies with score breakdowns, site health, and match explanations. Approve or exclude companies; approve or reject individual contacts. Every verdict shows its evidence.",
  },
  {
    title: "Polish the drafts",
    body:
      "Outreach holds one draft per contactable lead. Edit it, regenerate it, or send a test to yourself. Sending is off by default, so nothing reaches a prospect while you review.",
  },
  {
    title: "Go live",
    body:
      "Flip the sending switch in Settings, then approve drafts one by one. Replies land in Conversations, classified by intent, and meeting-ready prospects can be booked straight onto your Google Calendar.",
  },
] as const;

export default function DocsPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-20 pt-20 md:pt-28">
      <div className="space-y-4">
        <Eyebrow>Documentation</Eyebrow>
        <h1 className="display text-4xl md:text-5xl">
          From zero to <em>first reply</em>.
        </h1>
        <p className="text-base leading-relaxed text-ink-soft md:text-lg">
          SynthSales is deliberately simple to start: one CSV, one brief, one click. Here is the whole
          journey.
        </p>
      </div>

      <ol className="mt-12 space-y-8">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-5">
            <span className="font-serif text-2xl leading-none text-terracotta">0{i + 1}</span>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-14 border-t border-line pt-6 text-sm text-ink-soft">
        Stuck on something?{" "}
        <Link href="/contact" className="font-medium text-ink underline underline-offset-2">
          Write to us
        </Link>{" "}
        and a person will reply.
      </p>
    </section>
  );
}
