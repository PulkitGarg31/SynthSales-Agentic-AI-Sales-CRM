"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Progress } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { CampaignStatus } from "@/lib/api-types";

const statusTone: Record<CampaignStatus, "ok" | "warn" | "info" | "neutral" | "danger"> = {
  Running: "ok",
  Paused: "warn",
  Completed: "info",
  Draft: "neutral",
  Failed: "danger",
};

const filters: (CampaignStatus | "All")[] = ["All", "Running", "Paused", "Draft", "Completed"];

export default function CampaignsPage() {
  const { data, loading, error, reload } = useApi(() => api.campaigns(), []);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading label="Loading campaigns…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const list = data ?? [];
  const visible = list.filter((c) => filter === "All" || c.status === filter);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setMenuFor(null);
    try {
      await fn();
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Create, monitor, and control your outreach campaigns."
        actions={
          <Button href="/campaigns/new">
            <Icon.Plus width={16} height={16} /> New campaign
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              filter === f
                ? "bg-ink text-white"
                : "bg-surface text-ink-500 ring-1 ring-inset ring-line hover:bg-ink/5"
            }`}
          >
            {f}
            {f !== "All" && (
              <span className="ml-1.5 text-xs opacity-70">
                {list.filter((c) => c.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="p-0">
          <div className="px-6 py-14 text-center">
            <h3 className="text-lg font-bold text-ink">No campaigns here</h3>
            <p className="mt-1 text-sm text-ink-500">
              Nothing matches this filter. Create a campaign to get started.
            </p>
            <Button href="/campaigns/new" className="mt-4">
              <Icon.Plus width={16} height={16} /> New campaign
            </Button>
          </div>
        </Card>
      ) : (
        <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {visible.map((c) => {
            const progress =
              c.companies_uploaded === 0
                ? 0
                : Math.round((c.companies_researched / c.companies_uploaded) * 100);
            return (
              <Card key={c.id} className="relative flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={statusTone[c.status]}>{c.status}</Badge>
                  <div className="relative">
                    <button
                      onClick={() => setMenuFor((m) => (m === c.id ? null : c.id))}
                      className="rounded-lg p-1 text-ink-300 hover:bg-ink/5 hover:text-ink"
                      aria-label="Campaign actions"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="12" cy="19" r="1.6" />
                      </svg>
                    </button>
                    {menuFor === c.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl">
                          {c.status === "Running" ? (
                            <MenuItem icon="Pause" onClick={() => act(() => api.updateCampaign(c.id, { status: "Paused" }))}>
                              Pause
                            </MenuItem>
                          ) : (
                            <MenuItem icon="Play" onClick={() => act(() => api.updateCampaign(c.id, { status: "Running" }))}>
                              {c.status === "Draft" ? "Launch" : "Resume"}
                            </MenuItem>
                          )}
                          <MenuItem icon="Copy" onClick={() => act(() => api.duplicateCampaign(c.id))}>
                            Duplicate
                          </MenuItem>
                          <MenuItem icon="Logs" onClick={() => act(() => api.updateCampaign(c.id, { status: "Completed" }))}>
                            Archive
                          </MenuItem>
                          <div className="my-1 h-px bg-line" />
                          <MenuItem icon="Trash" danger onClick={() => act(() => api.deleteCampaign(c.id))}>
                            Delete
                          </MenuItem>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <Link href={`/campaigns/${c.id}`} className="mt-3 block">
                  <h3 className="text-base font-bold text-ink hover:underline">{c.name}</h3>
                </Link>
                <p className="mt-0.5 text-sm text-ink-500">{c.product}</p>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-ink-500">
                    <span>Researched</span>
                    <span>
                      {c.companies_researched}/{c.companies_uploaded}
                    </span>
                  </div>
                  <Progress value={progress} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                  <Stat label="Sent" value={c.emails_sent} />
                  <Stat label="Replies" value={c.replies_received} />
                  <Stat label="Meetings" value={c.meetings_booked} />
                </div>

                <p className="mt-3 text-xs text-ink-300">Created {c.created_at.slice(0, 10)}</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-xl text-ink">{value}</div>
      <div className="text-[11px] text-ink-500">{label}</div>
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: keyof typeof Icon;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  const MIcon = Icon[icon];
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
        danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-ink/5"
      }`}
    >
      <MIcon width={15} height={15} /> {children}
    </button>
  );
}
