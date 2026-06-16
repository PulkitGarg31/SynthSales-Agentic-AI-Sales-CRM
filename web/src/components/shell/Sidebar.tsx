"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Wordmark } from "@/components/brand/Wordmark";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { isNavActive, NAV } from "@/lib/nav";

function NavColumn({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me } = useAuth();

  return (
    <div className="flex h-full w-60 flex-col overflow-y-auto border-r border-line bg-cream">
      <div className="px-5 pb-4 pt-5">
        <Link href="/dashboard" onClick={onNavigate} aria-label="SynthSales dashboard">
          <Wordmark withEmblem />
        </Link>
      </div>
      <nav className="flex-1 space-y-5 px-3 pb-6">
        {NAV.filter((g) => !g.adminOnly || me.is_admin).map((group) => (
          <div key={group.group}>
            <div className="px-3 pb-1.5">
              <Eyebrow>{group.group}</Eyebrow>
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isNavActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? "font-medium text-ink"
                          : "text-ink-soft hover:bg-paper hover:text-ink"
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-terracotta"
                        />
                      )}
                      <Icon size={16} strokeWidth={1.75} className={active ? "text-terracotta" : ""} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

/**
 * App navigation. Fixed 240px column at `lg`+; below that it renders as a
 * slide-over sheet controlled by `open`/`onClose` (hamburger lives in Topbar).
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  // While the mobile sheet is open: Escape closes, page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      {/* Desktop: fixed column */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">
        <NavColumn />
      </aside>

      {/* Mobile: sheet + backdrop */}
      {open && (
        <div className="lg:hidden">
          <button
            aria-label="Close menu"
            onClick={onClose}
            className="fixed inset-0 z-30 bg-ink/40"
          />
          <aside className="fixed inset-y-0 left-0 z-40">
            <NavColumn onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
