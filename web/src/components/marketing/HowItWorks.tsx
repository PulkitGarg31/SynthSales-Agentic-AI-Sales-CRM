import { Eyebrow } from "@/components/ui/Eyebrow";
import { PHASES } from "@/lib/copy";

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
        <div className="max-w-2xl space-y-4">
          <Eyebrow index="02">How it works</Eyebrow>
          <h2 className="display text-3xl md:text-4xl">
            Four phases, <em>eight agents</em>.
          </h2>
          <p className="text-base leading-relaxed text-ink-soft">
            Each phase hands its evidence to the next. Run the whole pipeline at once, or re-run a
            single stage when you want a fresh look.
          </p>
        </div>
        <div className="relative mt-12">
          {/* Dashed connector behind the cards (visible in the gaps). */}
          <div aria-hidden className="absolute inset-x-0 top-10 hidden border-t border-dashed border-line lg:block" />
          <ol className="relative grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PHASES.map((phase) => (
              <li key={phase.index} className="rounded-2xl border border-line bg-paper p-6">
                <p className="font-serif text-3xl leading-none text-terracotta">{phase.index}</p>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">{phase.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{phase.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {phase.agents.map((agent) => (
                    <span
                      key={agent}
                      className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-soft"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
