import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = { title: "Changelog" };

const ENTRIES = [
  {
    date: "June 2026",
    title: "Dark mode + a faster way to reach us",
    points: [
      "Full dark mode across the site and the app, with a toggle in every topbar.",
      "A contact form that lands in a real inbox; a person replies.",
    ],
  },
  {
    date: "May 2026",
    title: "Sharper contact discovery",
    points: [
      "Deeper LinkedIn search with a stricter decision-maker filter.",
      "Catch-all mail servers handled honestly: best guess kept, labeled Risky.",
      "A per-company mail-domain override for tricky setups.",
    ],
  },
  {
    date: "April 2026",
    title: "Follow-ups that know when to stop",
    points: [
      "Automatic nudges for quiet threads, capped at three.",
      "Stalled threads are marked and set aside instead of dripping forever.",
      "A clear 'no' in a reply now opts the contact out on the spot.",
    ],
  },
  {
    date: "March 2026",
    title: "Meetings on your calendar",
    points: [
      "Booking from a conversation creates a real Google Calendar event with a Meet link.",
      "No calendar connected? Paste your own link; nothing is fabricated.",
    ],
  },
  {
    date: "February 2026",
    title: "Verification, hardened",
    points: [
      "Every address confirmed as a deliverable mailbox before a draft is written.",
      "Parked and dead company domains detected and scored down honestly.",
    ],
  },
] as const;

export default function ChangelogPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-20 pt-20 md:pt-28">
      <div className="space-y-4">
        <Eyebrow>Changelog</Eyebrow>
        <h1 className="display text-4xl md:text-5xl">
          Always <em>shipping</em>.
        </h1>
      </div>

      <div className="mt-12 space-y-10">
        {ENTRIES.map((entry) => (
          <article key={entry.date} className="border-t border-line pt-6">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
              {entry.date}
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">{entry.title}</h2>
            <ul className="mt-3 space-y-1.5">
              {entry.points.map((point) => (
                <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-terracotta" />
                  {point}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
