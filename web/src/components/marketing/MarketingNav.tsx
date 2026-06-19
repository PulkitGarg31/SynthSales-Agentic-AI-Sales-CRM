"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { label: string; href: string };

// Landing-page section element ids -> the nav href they correspond to. A section
// not listed here (Showcase, Testimonials, FAQ, the CTA band, ...) maps to null,
// which clears the underline from every link while it's the one in view.
const SECTION_HREF: Record<string, string> = {
  home: "/",
  how: "/#how",
  features: "/#features",
};

/** The nav href of the landing-page section currently under the viewport's
 *  mid-line, or null off the landing page / inside an untracked section. */
function useActiveHref(enabled: boolean): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setHref(null);
      return;
    }
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main section"));
    if (sections.length === 0) return;
    // A zero-height line at the vertical middle: the page's sections are
    // contiguous, so exactly one crosses it at a time -> unambiguous active id.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setHref(SECTION_HREF[e.target.id] ?? null);
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [enabled]);
  return href;
}

/** Marketing nav links with an underline on the active route / in-view section. */
export function MarketingNav({
  items,
  className,
  linkClassName,
}: {
  items: readonly NavItem[];
  className?: string;
  linkClassName?: string;
}) {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const activeHref = useActiveHref(onLanding);

  function isActive(href: string): boolean {
    // Landing items (Home "/", anchors "/#...") follow scroll position; they go
    // inactive in sections that aren't in the nav.
    if (href === "/" || href.startsWith("/#")) return onLanding && href === activeHref;
    // Page links follow the route.
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Main" className={className}>
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${linkClassName ?? ""}${active ? " text-ink" : ""}`}
          >
            <span className="relative inline-block">
              {item.label}
              <span
                aria-hidden
                className={`absolute -bottom-1 left-0 h-px w-full origin-left bg-terracotta transition-transform duration-200 ${
                  active ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
