import {
  CalendarCheck2,
  MailCheck,
  MessagesSquare,
  Radar,
  Repeat2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { FEATURES, type FeatureIcon } from "@/lib/copy";

const ICONS: Record<FeatureIcon, LucideIcon> = {
  "mail-check": MailCheck,
  radar: Radar,
  "messages-square": MessagesSquare,
  repeat: Repeat2,
  "calendar-check": CalendarCheck2,
  "shield-check": ShieldCheck,
};

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
        <div className="max-w-2xl space-y-4">
          <Eyebrow>What’s built in</Eyebrow>
          <h2 className="display text-3xl md:text-4xl">
            Careful by <em>construction</em>.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = ICONS[feature.icon];
            return (
              <div key={feature.title} className="rounded-2xl border border-line bg-paper p-6">
                <Icon aria-hidden className="size-5 text-terracotta" strokeWidth={1.75} />
                <h3 className="mt-4 text-base font-semibold tracking-tight text-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{feature.line}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
