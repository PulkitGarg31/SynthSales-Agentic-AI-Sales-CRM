"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navSections } from "@/lib/nav";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/components/AuthProvider";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-ink text-white">
      <div className="px-5 py-5">
        <Link href="/dashboard" className="inline-flex" onClick={onNavigate}>
          <Logo variant="light" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {navSections.map((section, i) => (
          <div key={i} className="mb-5">
            {section.title && (
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-white/40">
                {section.title}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const ActiveIcon = Icon[item.icon];
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand text-ink"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <ActiveIcon
                        width={18}
                        height={18}
                        className={active ? "text-ink" : "text-white/70"}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => {
            onNavigate?.();
            logout();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Icon.Logout width={18} height={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
