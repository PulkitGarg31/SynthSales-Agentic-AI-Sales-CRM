import { Check } from "lucide-react";
import { HUMAN_LOOP } from "@/lib/copy";

// Dark split section on the kill-switch and approval gates. Cream text on
// bg-band; no emblem here (the PNG is cleaned for light backgrounds only).
export function HumanLoop() {
  return (
    <section className="bg-band">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 md:py-24 lg:grid-cols-2">
        <div className="space-y-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-cream/60">
            The human loop
          </p>
          <h2 className="display text-3xl text-cream md:text-4xl">
            {HUMAN_LOOP.headline.pre}
            <em>{HUMAN_LOOP.headline.em}</em>
            {HUMAN_LOOP.headline.post}
          </h2>
          <p className="font-serif text-lg italic leading-relaxed text-cream/70">
            {HUMAN_LOOP.aside}
          </p>
        </div>
        <div className="space-y-6 lg:pt-10">
          <p className="text-base leading-relaxed text-cream/75">{HUMAN_LOOP.body}</p>
          <ul className="space-y-3">
            {HUMAN_LOOP.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-cream/90">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-terracotta" strokeWidth={2} />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
