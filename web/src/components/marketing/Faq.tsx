import { Plus } from "lucide-react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { FAQ } from "@/lib/copy";

// Native <details>/<summary> accordion - no client JS needed.
export function Faq() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-3xl px-6 py-20 md:py-24">
        <div className="space-y-4">
          <Eyebrow>Questions</Eyebrow>
          <h2 className="display text-3xl md:text-4xl">
            Asked, <em>answered</em>.
          </h2>
        </div>
        <div className="mt-10">
          {FAQ.map((item) => (
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
  );
}
