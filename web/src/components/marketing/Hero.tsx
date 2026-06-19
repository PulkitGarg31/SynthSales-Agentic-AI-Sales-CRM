import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { HERO } from "@/lib/copy";

export function Hero() {
  return (
    <section id="home" className="mx-auto w-full max-w-6xl px-6 pb-20 pt-20 md:pb-24 md:pt-28">
      <div className="flex flex-col items-center gap-6 text-center">
        <Eyebrow>{HERO.eyebrow}</Eyebrow>
        <h1 className="display max-w-4xl text-[clamp(2.8rem,6vw,4.5rem)]">
          {HERO.headline.pre}
          <em>{HERO.headline.em}</em>
          <span className="text-terracotta">{HERO.headline.post}</span>
        </h1>
        <p className="font-serif text-xl italic text-ink md:text-2xl">
          {HERO.tagline.replace(/\.$/, "")}
          <span className="text-terracotta">.</span>
        </p>
        <p className="max-w-2xl text-base leading-relaxed text-ink-soft md:text-lg">{HERO.sub}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={HERO.primaryCta.href}
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition hover:opacity-90"
          >
            {HERO.primaryCta.label}
          </Link>
          <Link
            href={HERO.secondaryCta.href}
            className="rounded-full border border-line bg-transparent px-6 py-3 text-sm font-medium text-ink transition hover:bg-paper"
          >
            {HERO.secondaryCta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
