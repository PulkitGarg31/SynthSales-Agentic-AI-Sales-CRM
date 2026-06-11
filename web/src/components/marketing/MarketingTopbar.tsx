import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

const NAV = [
  { label: "Product", href: "/#features" },
  { label: "How it works", href: "/#how" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export function MarketingTopbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" aria-label="Sellari AI home">
          <Wordmark withEmblem />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm text-ink-soft transition hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft transition hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
