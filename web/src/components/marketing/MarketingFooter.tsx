import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { FOOTER_COLUMNS } from "@/lib/copy";

export function MarketingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="space-y-4">
            <Wordmark withEmblem />
            <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
              Eight agents research, verify, and draft. You approve every send.
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
                {column.title}
              </p>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href === "#" ? (
                      // No real target yet — plain text, not a keyboard stop to nowhere.
                      <span className="text-sm text-ink-faint">{link.label}</span>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-ink-soft transition hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-14 flex items-center justify-between gap-4 border-t border-line pt-6 text-xs text-ink-soft">
          <p>© {new Date().getFullYear()} Sellari AI</p>
          <p className="font-serif italic">Built for quiet pipelines.</p>
        </div>
      </div>
      {/* Giant closing wordmark — pure text per the design reference, not the
          Wordmark component (the emblem PNG is sized for UI chrome, not 14vw). */}
      <p aria-hidden className="display select-none overflow-hidden px-2 pb-2 pt-8 text-[14vw] leading-none">
        sellari <em>ai</em>
        <span className="text-terracotta">.</span>
      </p>
    </footer>
  );
}
