import type { Metadata } from "next";
import { LifeBuoy, Mail, Plus } from "lucide-react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { FAQ } from "@/lib/copy";

export const metadata: Metadata = { title: "Contact" };

const CHANNELS = [
  {
    icon: Mail,
    title: "Say hello",
    line: "Questions about the product, partnerships, or anything else. We read everything.",
    email: "hello@sellari.ai",
  },
  {
    icon: LifeBuoy,
    title: "Get support",
    line: "Already running campaigns and something looks off? Write in with your account email.",
    email: "support@sellari.ai",
  },
] as const;

export default function ContactPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-3xl px-6 pb-16 pt-20 md:pt-28">
        <div className="space-y-4">
          <Eyebrow>Contact</Eyebrow>
          <h1 className="display text-4xl md:text-5xl">
            Talk to a <em>human</em>.
          </h1>
          <p className="text-base leading-relaxed text-ink-soft md:text-lg">
            No ticket portal, no chatbot maze. Pick an inbox and a person will reply.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {CHANNELS.map((channel) => (
            <div key={channel.email} className="rounded-2xl border border-line bg-paper p-6">
              <channel.icon aria-hidden className="size-5 text-terracotta" strokeWidth={1.75} />
              <h2 className="mt-4 text-base font-semibold tracking-tight text-ink">
                {channel.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{channel.line}</p>
              <a
                href={`mailto:${channel.email}`}
                className="mt-4 inline-block text-sm font-medium text-ink underline decoration-line underline-offset-4 transition hover:decoration-terracotta"
              >
                {channel.email}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto w-full max-w-3xl px-6 py-20 md:py-24">
          <div className="space-y-4">
            <Eyebrow>Before you write</Eyebrow>
            <h2 className="display text-3xl md:text-4xl">
              The <em>usual</em> questions.
            </h2>
          </div>
          <div className="mt-10">
            {FAQ.slice(0, 3).map((item) => (
              <details key={item.q} className="group border-b border-line py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus
                    aria-hidden
                    className="size-4 shrink-0 text-ink-faint transition group-open:rotate-45"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
