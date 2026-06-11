import Link from "next/link";
import { Menu } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

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
          <ThemeToggle />
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
          {/* No-JS mobile nav: native <details> disclosure, server-rendered. */}
          <details className="relative md:hidden">
            <summary
              aria-label="Open navigation"
              className="flex cursor-pointer list-none items-center rounded-lg p-2 text-ink-soft transition hover:text-ink [&::-webkit-details-marker]:hidden"
            >
              <Menu size={18} strokeWidth={1.75} aria-hidden />
            </summary>
            <nav
              aria-label="Main"
              className="absolute right-0 mt-2 w-48 rounded-xl border border-line bg-paper py-2"
            >
              {NAV.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block px-4 py-2 text-sm text-ink-soft transition hover:bg-cream hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
