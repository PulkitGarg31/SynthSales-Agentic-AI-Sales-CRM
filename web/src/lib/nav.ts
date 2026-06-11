import {
  LayoutDashboard, Megaphone, Microscope, Users, PenLine, Inbox,
  CalendarClock, Bot, PlugZap, Activity, Settings, ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  eyebrow: string;
}

export interface NavGroup {
  group: string;
  /** Render this group only for admins (Sidebar checks `me.is_admin`). */
  adminOnly?: boolean;
  items: NavItem[];
}

// Typed as NavGroup[] (not `as const`) so the optional `adminOnly` — present on
// only one group — type-checks uniformly for consumers.
export const NAV: NavGroup[] = [
  { group: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, eyebrow: "01 — Dashboard" },
  ]},
  { group: "Pipeline", items: [
    { href: "/campaigns", label: "Campaigns", icon: Megaphone, eyebrow: "02 — Campaigns" },
    { href: "/research", label: "Research", icon: Microscope, eyebrow: "03 — Research" },
    { href: "/contacts", label: "Contacts", icon: Users, eyebrow: "04 — Contacts" },
    { href: "/outreach", label: "Outreach", icon: PenLine, eyebrow: "05 — Outreach" },
  ]},
  { group: "Engage", items: [
    { href: "/conversations", label: "Conversations", icon: Inbox, eyebrow: "06 — Conversations" },
    { href: "/meetings", label: "Meetings", icon: CalendarClock, eyebrow: "07 — Meetings" },
  ]},
  { group: "System", items: [
    { href: "/agents", label: "Agents", icon: Bot, eyebrow: "08 — Agents" },
    { href: "/integrations", label: "Integrations", icon: PlugZap, eyebrow: "09 — Integrations" },
    { href: "/activity", label: "Activity", icon: Activity, eyebrow: "10 — Activity" },
    { href: "/settings", label: "Settings", icon: Settings, eyebrow: "11 — Settings" },
  ]},
  { group: "Admin", adminOnly: true, items: [
    { href: "/admin", label: "Admin", icon: ShieldCheck, eyebrow: "12 — Admin" },
  ]},
];

/** Active when the pathname is the item itself or nested under it (/campaigns/3). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Resolve the nav item for the current pathname (Topbar eyebrow lookup). */
export function navItemFor(pathname: string): NavItem | null {
  for (const group of NAV) {
    for (const item of group.items) {
      if (isNavActive(pathname, item.href)) return item;
    }
  }
  return null;
}
