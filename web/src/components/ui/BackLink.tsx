import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Persistent "back to the parent list" affordance for drill-down pages
 * (a campaign's pipeline, a company's research detail, the new-campaign
 * wizard, the admin drill-downs). Navigates with a real Link to a fixed
 * parent route rather than router.back() so it always lands on the list,
 * even when the page was opened from a deep link or a fresh tab.
 */
export function BackLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink ${className}`}
    >
      <ArrowLeft size={15} strokeWidth={1.75} />
      {label}
    </Link>
  );
}
