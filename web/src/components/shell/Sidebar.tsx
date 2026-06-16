"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/components/AuthProvider";
import { Wordmark } from "@/components/brand/Wordmark";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { isNavActive, NAV, type NavItem } from "@/lib/nav";

/**
 * Campaigns nav row: the label links to the list page; the chevron expands an
 * inline, scrollable list of the user's campaigns (each opens its pipeline).
 * Auto-expands when you're anywhere under /campaigns; still manually toggleable.
 */
function CampaignsNavItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const campaigns = useApi(api.campaigns);
  const Icon = item.icon;

  const inArea = pathname === item.href || pathname.startsWith(`${item.href}/`);
  // The parent row owns the list/new pages; a specific campaign highlights its
  // own sub-row instead of the parent.
  const parentActive = pathname === item.href || pathname === "/campaigns/new";

  // Follow the campaigns area: expand on entering /campaigns/*, collapse on
  // leaving it (e.g. navigating to Dashboard/Settings). Manual toggles persist
  // while you stay within the same in/out state.
  const [open, setOpen] = useState(inArea);
  const [wasInArea, setWasInArea] = useState(inArea);
  if (inArea !== wasInArea) {
    setWasInArea(inArea);
    setOpen(inArea);
  }

  const rows = campaigns.data ?? [];

  return (
    <li>
      <div className="flex items-center gap-1">
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={parentActive ? "page" : undefined}
          className={`relative flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            parentActive ? "font-medium text-ink" : "text-ink-soft hover:bg-paper hover:text-ink"
          }`}
        >
          {parentActive && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-terracotta"
            />
          )}
          <Icon size={16} strokeWidth={1.75} className={parentActive ? "text-terracotta" : ""} />
          {item.label}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Collapse campaigns" : "Expand campaigns"}
          aria-expanded={open}
          className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-paper hover:text-ink"
        >
          <ChevronDown
            size={15}
            strokeWidth={1.75}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <ul className="mt-0.5 max-h-64 space-y-0.5 overflow-y-auto pl-9 pr-1">
          {campaigns.loading ? (
            <li className="px-3 py-1.5 text-xs text-ink-faint">Loading…</li>
          ) : campaigns.error ? (
            <li className="px-3 py-1.5 text-xs text-rust">Couldn’t load campaigns</li>
          ) : rows.length === 0 ? (
            <li className="px-3 py-1.5 text-xs text-ink-faint">No campaigns yet</li>
          ) : (
            rows.map((c) => {
              const active = pathname === `${item.href}/${c.id}`;
              return (
                <li key={c.id}>
                  <Link
                    href={`${item.href}/${c.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={c.name}
                    className={`block truncate rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      active ? "font-medium text-ink" : "text-ink-soft hover:bg-paper hover:text-ink"
                    }`}
                  >
                    {c.name}
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      )}
    </li>
  );
}

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
                if (item.href === "/campaigns") {
                  return (
                    <CampaignsNavItem key={item.href} item={item} onNavigate={onNavigate} />
                  );
                }
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
