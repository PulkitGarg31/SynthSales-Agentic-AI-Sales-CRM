"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

const iconForType: Record<string, keyof typeof Icon> = {
  reply: "Chat",
  meeting: "Calendar",
  verification: "Mail",
  campaign: "Campaign",
  followup: "Mail",
  error: "Info",
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { data: notifications } = useApi(() => api.notifications(), []);
  const [openBell, setOpenBell] = useState(false);
  const [openUser, setOpenUser] = useState(false);

  const items = notifications ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-cream/90 px-4 backdrop-blur lg:px-8">
      <button onClick={onMenu} className="rounded-lg p-2 text-ink hover:bg-ink/5 lg:hidden" aria-label="Open menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Icon.Search width={18} height={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
        <input
          placeholder="Search companies, contacts, campaigns…"
          className="w-full rounded-full border border-line bg-surface py-2 pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-300 focus:border-brand-600 focus:ring-2 focus:ring-brand/30"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setOpenBell((v) => !v); setOpenUser(false); }}
            className="relative rounded-full p-2 text-ink hover:bg-ink/5"
            aria-label="Notifications"
          >
            <Icon.Bell width={20} height={20} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
          {openBell && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenBell(false)} />
              <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="text-sm font-bold text-ink">Notifications</span>
                  <Link href="/notifications" className="text-xs font-semibold text-info hover:underline" onClick={() => setOpenBell(false)}>
                    View all
                  </Link>
                </div>
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {items.slice(0, 5).map((n) => {
                    const NIcon = Icon[iconForType[n.type] ?? "Info"];
                    return (
                      <li key={n.id} className={`flex gap-3 px-4 py-3 ${n.read ? "" : "bg-brand/5"}`}>
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink">
                          <NIcon width={16} height={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{n.title}</p>
                          <p className="truncate text-xs text-ink-500">{n.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                  {items.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-ink-300">No notifications</li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>

        {/* User */}
        <div className="relative">
          <button
            onClick={() => { setOpenUser((v) => !v); setOpenBell(false); }}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-ink/5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-bold text-brand">
              {user ? initials(user.name) : "—"}
            </span>
            <span className="hidden text-sm font-semibold text-ink sm:block">{user?.name}</span>
          </button>
          {openUser && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenUser(false)} />
              <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
                <div className="border-b border-line px-4 py-3">
                  <p className="text-sm font-bold text-ink">{user?.name}</p>
                  <p className="truncate text-xs text-ink-500">{user?.email}</p>
                </div>
                <div className="p-1.5">
                  <Link href="/settings" onClick={() => setOpenUser(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-ink/5">
                    <Icon.Settings width={16} height={16} /> Settings
                  </Link>
                  <Link href="/billing" onClick={() => setOpenUser(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-ink/5">
                    <Icon.Card width={16} height={16} /> Billing
                  </Link>
                  <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10">
                    <Icon.Logout width={16} height={16} /> Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
