import { Icon } from "@/components/icons";

export interface NavItem {
  label: string;
  href: string;
  icon: keyof typeof Icon;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "Dashboard" },
      { label: "Campaigns", href: "/campaigns", icon: "Campaign" },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { label: "Company Research", href: "/research", icon: "Research" },
      { label: "Contacts", href: "/contacts", icon: "Contacts" },
      { label: "Email Review", href: "/email-review", icon: "Mail" },
      { label: "Conversations", href: "/conversations", icon: "Chat" },
      { label: "Meetings", href: "/meetings", icon: "Calendar" },
    ],
  },
  {
    title: "Automation",
    items: [
      { label: "Agents", href: "/agents", icon: "Bot" },
      { label: "Integrations", href: "/integrations", icon: "Plug" },
      { label: "Activity Logs", href: "/logs", icon: "Logs" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Notifications", href: "/notifications", icon: "Bell" },
      { label: "Billing", href: "/billing", icon: "Card" },
      { label: "Settings", href: "/settings", icon: "Settings" },
      { label: "About", href: "/about", icon: "Info" },
    ],
  },
];
