"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { eyebrowFor } from "@/lib/nav";
import { useDemo } from "@/lib/demo";
import { Bell } from "./Bell";

/** Persistent "this account is read-only" marker shown only in the demo. */
function DemoChip() {
  const demo = useDemo();
  if (!demo) return null;
  return <Badge tone="amber">Demo · read-only</Badge>;
}

function OutboundChip() {
  const { me } = useAuth();
  if (me.outbound_enabled) return <Badge tone="moss">Sending live</Badge>;
  return (
    <Link
      href="/settings?tab=sending"
      aria-label="Sending paused, open sending settings"
      className="transition-opacity hover:opacity-75"
    >
      <Badge tone="amber">Sending paused</Badge>
    </Link>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function UserMenu() {
  const { me, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  // The shell persists across navigation - close on route change so a menu
  // opened on one page can't linger over the next.
  const pathname = usePathname();
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const itemCls =
    "flex w-full items-center gap-2.5 px-4 py-2 text-sm text-ink-soft transition-colors hover:bg-cream hover:text-ink";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-band text-xs font-semibold text-cream"
      >
        {initialsOf(me.name)}
      </button>

      {open && (
        <>
          <button
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-line bg-paper py-2 shadow-lg">
            <div className="border-b border-line px-4 pb-2">
              <p className="truncate text-sm font-medium text-ink">{me.name}</p>
              <p className="truncate text-xs text-ink-soft">{me.email}</p>
            </div>
            <div className="pt-1">
              <Link href="/settings" onClick={() => setOpen(false)} className={itemCls}>
                <Settings size={15} strokeWidth={1.75} /> Settings
              </Link>
              {me.is_admin && (
                <Link href="/admin" onClick={() => setOpen(false)} className={itemCls}>
                  <ShieldCheck size={15} strokeWidth={1.75} /> Admin
                </Link>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className={itemCls}
              >
                <LogOut size={15} strokeWidth={1.75} /> Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Top strip: hamburger (mobile), current page eyebrow, outbound chip + bell + user. */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const eyebrow = eyebrowFor(pathname);

  return (
    // No backdrop-blur here: a backdrop-filter turns the header into a
    // containing block for fixed descendants, which would shrink the
    // dropdowns' full-viewport click-outside overlays to the header strip.
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-cream px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-paper hover:text-ink lg:hidden"
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      </div>
      <div className="flex items-center gap-3">
        <DemoChip />
        <OutboundChip />
        <ThemeToggle />
        <Bell />
        <UserMenu />
      </div>
    </header>
  );
}
