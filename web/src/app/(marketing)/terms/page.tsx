import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = { title: "Terms" };

const SECTIONS = [
  {
    title: "The service",
    body:
      "SynthSales researches the companies you upload, finds and verifies contacts, drafts outreach, and manages replies. You keep ownership of everything you upload and everything the pipeline produces for you.",
  },
  {
    title: "Acceptable use",
    body:
      "Use SynthSales for legitimate business outreach only. You are responsible for complying with the anti-spam and data-protection laws that apply to you (CAN-SPAM, GDPR, and friends), for honoring opt-outs, and for what you approve for sending.",
  },
  {
    title: "Your approval gate",
    body:
      "Outbound email is disabled by default. By enabling sending you confirm that the messages you approve may be delivered to the recipients you selected, from the email identity you configured.",
  },
  {
    title: "No warranty",
    body:
      "Research, scores and drafts are produced by automated agents and provided as-is. Verify anything that matters before relying on it; SynthSales is a tool, not a guarantee of meetings.",
  },
  {
    title: "Liability",
    body:
      "To the maximum extent allowed by law, our liability is limited to the amount you paid for the service in the twelve months before a claim. We are not liable for indirect or consequential damages.",
  },
] as const;

export default function TermsPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-20 pt-20 md:pt-28">
      <div className="space-y-4">
        <Eyebrow>Terms</Eyebrow>
        <h1 className="display text-4xl md:text-5xl">
          Fair terms, <em>plain words</em>.
        </h1>
        <p className="text-sm text-ink-soft">Effective June 12, 2026</p>
      </div>

      <div className="mt-12 space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="text-base font-semibold tracking-tight text-ink">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{section.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-14 border-t border-line pt-6 text-sm text-ink-soft">
        Anything unclear?{" "}
        <Link href="/contact" className="font-medium text-ink underline underline-offset-2">
          Ask us directly
        </Link>
        .
      </p>
    </section>
  );
}
