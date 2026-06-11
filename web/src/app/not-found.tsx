import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

// Root-level 404 — renders outside the (marketing)/(app) layouts, so it carries
// its own minimal centered cream treatment (body is already cream).
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Image
        src="/brand/emblem.png"
        alt=""
        width={742}
        height={894}
        sizes="64px"
        className="h-16 w-auto"
        priority
      />
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">404</p>
      <h1 className="display text-4xl md:text-5xl">
        This trail goes <em>nowhere</em>.
      </h1>
      <p className="max-w-md text-base leading-relaxed text-ink-soft">
        The page you’re after doesn’t exist, or it moved. Best to head back and pick up the path
        from there.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition hover:opacity-90"
      >
        Back to camp
      </Link>
    </main>
  );
}
