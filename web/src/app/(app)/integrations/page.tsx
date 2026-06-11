"use client";

import Link from "next/link";
import {
  AtSign,
  CalendarClock,
  Inbox,
  KeyRound,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/components/AuthProvider";
import type { Tone } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SkeletonRows } from "@/components/ui/Skeleton";

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
  const health = useApi(api.health);

  const integ = health.data?.integrations ?? null;
  // Backend reports either a paid provider name or the literal "free (syntax+MX)".
  const paidVerify = integ !== null && !integ.email_verification.startsWith("free");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="display text-3xl sm:text-4xl">Integrations</h1>
        <p className="mt-2 font-serif italic text-ink-soft">
          What the backend can reach right now — everything degrades gracefully.
        </p>
      </header>

      {health.loading ? (
        <SkeletonRows n={4} />
      ) : health.error ? (
        // The health endpoint failing means the backend itself is unreachable.
        <ErrorCard message={health.error} onRetry={health.reload} />
      ) : integ ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatusCard
            icon={Sparkles}
            name="AI providers"
            chip={integ.ai ? "Connected" : "Off"}
            tone={integ.ai ? "moss" : "faint"}
            line={
              integ.ai
                ? "The LLM chain is live — research, scoring and drafting run at full depth."
                : "Agents fall back to deterministic heuristics — research gets shallower."
            }
          />
          <StatusCard
            icon={Search}
            name="Search"
            chip={integ.search ? "Connected" : "Off"}
            tone={integ.search ? "moss" : "faint"}
            line={
              integ.search
                ? "DuckDuckGo search powers enrichment, domain checks and the people finder."
                : "No web search — enrichment and the people finder can't reach the web."
            }
          />
          <StatusCard
            icon={ShieldCheck}
            name="Email verification"
            chip={integ.email_verification}
            tone={paidVerify ? "moss" : "amber"}
            line={
              paidVerify
                ? "A paid verifier confirms mailboxes before any outreach is drafted."
                : "Free checks only (syntax, role accounts, disposable, MX). Without a paid verifier, contacts stay Unknown and outreach drafts nothing."
            }
          />
          <StatusCard
            icon={AtSign}
            name="Email finder"
            chip={integ.email_finder}
            tone={integ.email_finder === "hunter" ? "moss" : "faint"}
            line={
              integ.email_finder === "hunter"
                ? "Hunter.io resolves one real address per company; the rest reuse its mail domain."
                : "No Hunter.io key — the agent falls back to web domain-discovery and pattern guessing."
            }
          />
          <StatusCard
            icon={Send}
            name="Email sending"
            chip={integ.email_mode}
            tone={integ.email_mode === "console" ? "amber" : "moss"}
            line={
              integ.email_mode === "console"
                ? "Emails are logged to the backend console — nothing is delivered."
                : integ.email_mode === "gmail"
                  ? "Outbound mail is delivered through the Gmail API."
                  : "Outbound mail is delivered through SMTP."
            }
          />
          <StatusCard
            icon={KeyRound}
            name="Google OAuth"
            chip={integ.google_oauth ? "Connected" : "Off"}
            tone={integ.google_oauth ? "moss" : "faint"}
            line={
              integ.google_oauth
                ? "Google sign-in and per-user Calendar / Gmail connections are available."
                : "Not configured — Google sign-in, Calendar and mailbox connections are unavailable."
            }
          />
        </div>
      ) : null}

      <div className="space-y-3">
        <Eyebrow>Your connections</Eyebrow>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatusCard
            icon={CalendarClock}
            name="Google Calendar"
            chip={me.calendar_connected ? "Connected" : "Not connected"}
            tone={me.calendar_connected ? "moss" : "faint"}
            line={
              me.calendar_connected
                ? "Booked meetings create real Calendar events with Google Meet links."
                : "Not connected — bookings need a manually supplied meeting link."
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
                : "Not connected — inbound replies aren't ingested or classified."
            }
            manageHref="/settings?tab=connections"
          />
        </div>
      </div>
    </div>
  );
}
