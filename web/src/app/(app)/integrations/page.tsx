"use client";

import Link from "next/link";
import { CalendarClock, Inbox, type LucideIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Tone } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";

// ---- local components ------------------------------------------------------

function StatusCard({
  icon: Icon,
  name,
  chip,
  tone,
  line,
  manageHref,
}: {
  icon: LucideIcon;
  name: string;
  chip: string;
  tone: Tone;
  line: string;
  manageHref?: string;
}) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink-soft">
            <Icon size={16} strokeWidth={1.75} aria-hidden />
          </span>
          <p className="truncate font-medium text-ink">{name}</p>
        </div>
        <Badge tone={tone}>{chip}</Badge>
      </div>
      <p className="mt-3 text-sm text-ink-soft">{line}</p>
      {manageHref && (
        <Link
          href={manageHref}
          className="mt-2 inline-block text-sm font-medium text-terracotta hover:underline"
        >
          Manage in Settings → Connections
        </Link>
      )}
    </section>
  );
}

// ---- page ------------------------------------------------------------------

export default function IntegrationsPage() {
  const { me } = useAuth();

  // Only the user's own connections live here. Backend/system integrations
  // (AI, search, verification, sending) are operator-configured and shown on
  // the Admin page, not surfaced per-user.
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="display text-3xl sm:text-4xl">Integrations</h1>
        <p className="mt-2 font-serif italic text-ink-soft">
          The services connected to your account.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatusCard
          icon={CalendarClock}
          name="Google Calendar"
          chip={me.calendar_connected ? "Connected" : "Not connected"}
          tone={me.calendar_connected ? "moss" : "faint"}
          line={
            me.calendar_connected
              ? "Booked meetings create real Calendar events with Google Meet links."
              : "Not connected: bookings need a manually supplied meeting link."
          }
          manageHref="/settings?tab=connections"
        />
        <StatusCard
          icon={Inbox}
          name="Mailbox"
          chip={me.mailbox_connected ? "Connected" : "Not connected"}
          tone={me.mailbox_connected ? "moss" : "faint"}
          line={
            me.mailbox_connected
              ? "The reply reader syncs your inbox and classifies inbound replies."
              : "Not connected: inbound replies aren't ingested or classified."
          }
          manageHref="/settings?tab=connections"
        />
      </div>
    </div>
  );
}
