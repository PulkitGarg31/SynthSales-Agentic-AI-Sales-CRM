import { Eyebrow } from "@/components/ui/Eyebrow";
import { TESTIMONIALS } from "@/lib/copy";

export function Testimonials() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
      <div className="max-w-2xl space-y-4">
        <Eyebrow index="04">From the field</Eyebrow>
        <h2 className="display text-3xl md:text-4xl">
          Quiet pipelines, <em>loud results</em>.
        </h2>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure
            key={t.name}
            className="flex flex-col justify-between gap-6 rounded-2xl border border-line bg-paper p-6"
          >
            <blockquote className="font-serif text-lg italic leading-relaxed text-ink">
              “{t.quote}”
            </blockquote>
            <figcaption>
              <p className="text-sm font-medium text-ink">{t.name}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{t.role}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
