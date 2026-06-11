import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";

export function CtaBand() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-20 md:pb-24">
      <div className="flex flex-col items-center gap-6 rounded-3xl border border-line bg-paper px-6 py-16 text-center md:py-20">
        <Eyebrow>Start in minutes</Eyebrow>
        <h2 className="display max-w-3xl text-3xl md:text-5xl">
          Your next customer is already <em>in the spreadsheet</em>.
        </h2>
        <p className="max-w-xl text-base leading-relaxed text-ink-soft">
          Upload the list, describe what you sell, and let the agents do the reading. Nothing sends
          until you say so.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-terracotta px-6 py-3 text-sm font-medium text-cream transition hover:opacity-90"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-line px-6 py-3 text-sm font-medium text-ink transition hover:bg-cream"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
