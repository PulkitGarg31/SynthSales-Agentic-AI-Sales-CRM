import { Eyebrow } from "@/components/ui/Eyebrow";
import { StreamingPoints } from "@/components/marketing/StreamingPoints";
import { PHASES } from "@/lib/copy";

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
        <div className="max-w-2xl space-y-4">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="display text-3xl md:text-4xl">
            From spreadsheet <em>to handshake</em>.
          </h2>
          <p className="text-base leading-relaxed text-ink-soft">
            A list goes in one end and meetings come out the other. Each phase hands its evidence
            to the next, and any stage can be re-run on its own when you want a fresh look.
          </p>
        </div>
        <div className="relative mt-12">
          {/* Dashed connector behind the cards (visible in the gaps). */}
          <div aria-hidden className="absolute inset-x-0 top-10 hidden border-t border-dashed border-line lg:block" />
          <ol className="relative grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PHASES.map((phase) => (
              <li key={phase.index} className="rounded-2xl border border-line bg-paper px-8 py-7">
                <p className="font-serif text-3xl leading-none text-terracotta">{phase.index}</p>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{phase.title}</h3>
                <StreamingPoints points={phase.points} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
