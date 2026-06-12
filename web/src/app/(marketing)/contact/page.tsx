import type { Metadata } from "next";
import { Mail, Plus } from "lucide-react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata: Metadata = { title: "Contact" };

// One real inbox: the form below delivers here, and the card offers it
// directly for people who prefer their own mail client.
const CONTACT_EMAIL = "brodomyjob@gmail.com";

// Contact-specific questions (the landing page has the product FAQ).
const CONTACT_FAQ = [
  {
    q: "How fast will I hear back?",
    a: "Usually within a day, often sooner. There is no ticket queue or support tier; messages land in a real inbox and a person answers.",
  },
  {
    q: "Can I get a demo?",
    a: "Yes. Mention a couple of times that suit you and we'll walk you through Sellari live, on your own company list if you bring one.",
  },
  {
    q: "Found a bug or have a feature idea?",
    a: "Send it through the form with as much detail as you can. The builders read every report themselves.",
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
            No ticket portal, no chatbot maze. Send a message and a person will reply.
          </p>
        </div>

        <div className="mt-12 rounded-2xl border border-line bg-paper p-6 md:p-8">
          <ContactForm />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper px-6 py-5">
          <Mail aria-hidden className="size-5 shrink-0 text-terracotta" strokeWidth={1.75} />
          <p className="text-sm leading-relaxed text-ink-soft">
            Prefer your own mail client? Questions, partnerships, support: write to{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-ink underline decoration-line underline-offset-4 transition hover:decoration-terracotta"
            >
              {CONTACT_EMAIL}
            </a>
            . We read everything.
          </p>
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
            {CONTACT_FAQ.map((item) => (
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
