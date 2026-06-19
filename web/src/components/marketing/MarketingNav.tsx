"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { label: string; href: string };

// Landing-page section element ids the in-page anchors point at. Module-level so
// the array identity stays stable across renders (it's an effect dependency).
const SECTION_IDS = ["how", "features"] as const;

/** Which landing-page section is currently under the viewport's reading line.
 *  Returns null off the landing page or before any tracked section is reached. */
function useActiveSection(enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setActive(null);
      return;
    }
    const els = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (els.length === 0) return;
    // A thin band near the top third of the viewport acts as the "reading line":
    // whichever section crosses it is the active one.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-30% 0px -65% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [enabled]);
  return active;
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
  const activeSection = useActiveSection(onLanding);

  function isActive(href: string): boolean {
    // Anchor links (/#how, /#features) are active by scroll position on "/".
    const hash = href.startsWith("/#") ? href.slice(2) : null;
    if (hash) return onLanding && hash === activeSection;
    // Page links are active on their own route and any nested route.
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
