import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = { title: "Changelog" };

const ENTRIES = [
  {
    date: "June 12, 2026",
    title: "Contact form + dark mode",
    points: [
      "A real contact form on the Contact page, delivered straight to our inbox.",
      "Full dark mode across the site and the app, with a toggle in every topbar.",
      "Landing-page copy refined end to end.",
    ],
  },
  {
    date: "June 11, 2026",
    title: "Sellari AI launches",
    points: [
      "Complete redesign: warm editorial interface across all 21 screens.",
      "New password-reset flow and an admin panel with cross-tenant tooling.",
      "Live pipeline page with per-agent re-runs and a streaming activity log.",
    ],
  },
  {
    date: "June 5, 2026",
    title: "Smarter contact discovery",
    points: [
      "Escalating LinkedIn search with a strict commercial-role gate.",
      "Catch-all mail servers handled honestly: best guess kept, labeled Risky.",
      "Hunter.io lookup for the top contact of each company, used sparingly.",
    ],
  },
  {
    date: "May 27, 2026",
    title: "The eight-agent pipeline",
    points: [
      "Research, scoring, people finding, email verification, outreach drafting, follow-up tracking, meeting booking, and reply reading: one orchestrated run.",
      "Everything degrades gracefully with zero credentials configured.",
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
