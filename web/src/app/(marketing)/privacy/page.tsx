import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = { title: "Privacy" };

const SECTIONS = [
  {
    title: "What we collect",
    body:
      "Your account details (name, email, password hash), the company lists and product briefs you upload, the research and drafts the pipeline produces for you, and, if you connect Google, the OAuth tokens needed for Calendar and inbox access.",
  },
  {
    title: "How we use it",
    body:
      "Only to run your campaigns: researching the companies you uploaded, verifying addresses, drafting outreach, and reading replies you receive. Your data trains nothing and is never shared between accounts.",
  },
  {
    title: "What we never do",
    body:
      "We do not sell your data, rent your lists, or email your prospects without your explicit approval. Outbound sending is off by default and stays off until you enable it.",
  },
  {
    title: "Google integrations",
    body:
      "Connecting Google Calendar lets Sellari create meeting events on your calendar; connecting your mailbox lets it read replies to your outreach. Both are optional, scoped narrowly, and can be disconnected in Settings at any time.",
  },
  {
    title: "Deletion",
    body:
      "Deleting a campaign removes its companies, contacts, drafts and conversations. Deleting your account removes everything you own. Write to us if you want a manual purge confirmed.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-20 pt-20 md:pt-28">
      <div className="space-y-4">
        <Eyebrow>Privacy</Eyebrow>
        <h1 className="display text-4xl md:text-5xl">
          Your data, <em>your rules</em>.
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
        Questions about your data?{" "}
        <Link href="/contact" className="font-medium text-ink underline underline-offset-2">
          Contact us
        </Link>
        .
      </p>
    </section>
  );
}
