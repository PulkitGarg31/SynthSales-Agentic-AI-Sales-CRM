import {
  LayoutDashboard, Megaphone, Inbox,
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

// Typed as NavGroup[] (not `as const`) so the optional `adminOnly` - present on
// only one group - type-checks uniformly for consumers.
export const NAV: NavGroup[] = [
  { group: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, eyebrow: "Dashboard" },
  ]},
  { group: "Pipeline", items: [
    { href: "/campaigns", label: "Campaigns", icon: Megaphone, eyebrow: "Campaigns" },
  ]},
  { group: "Engage", items: [
    { href: "/conversations", label: "Conversations", icon: Inbox, eyebrow: "Conversations" },
    { href: "/meetings", label: "Meetings", icon: CalendarClock, eyebrow: "Meetings" },
  ]},
  { group: "System", items: [
    { href: "/agents", label: "Agents", icon: Bot, eyebrow: "Agents" },
    { href: "/integrations", label: "Integrations", icon: PlugZap, eyebrow: "Integrations" },
    { href: "/activity", label: "Activity", icon: Activity, eyebrow: "Activity" },
    { href: "/settings", label: "Settings", icon: Settings, eyebrow: "Settings" },
  ]},
  { group: "Admin", adminOnly: true, items: [
    { href: "/admin", label: "Admin", icon: ShieldCheck, eyebrow: "Admin" },
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

// Routes the shell links to that deliberately have no sidebar entry - research,
// contacts and outreach are now reached through a campaign's pipeline, not the
// sidebar, but still need a Topbar eyebrow.
const EXTRA_EYEBROWS: Record<string, string> = {
  "/notifications": "Notifications",
  "/research": "Research",
  "/contacts": "Contacts",
  "/outreach": "Outreach",
};

/** Topbar eyebrow for the current pathname - NAV items first, then extras. */
export function eyebrowFor(pathname: string): string | null {
  const item = navItemFor(pathname);
  if (item) return item.eyebrow;
  for (const [href, eyebrow] of Object.entries(EXTRA_EYEBROWS)) {
    if (isNavActive(pathname, href)) return eyebrow;
  }
  return null;
}
