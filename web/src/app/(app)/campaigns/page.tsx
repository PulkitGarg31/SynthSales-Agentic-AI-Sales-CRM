"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Campaign } from "@/lib/api-types";
import { CAMPAIGN_TONE } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chips } from "@/components/ui/Chips";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Input } from "@/components/ui/Field";
import { ConfirmModal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/Skeleton";

// ---- helpers ---------------------------------------------------------------

const STATUS_FILTERS = ["All", "Draft", "Running", "Paused", "Completed"].map((s) => ({
  value: s,
  label: s,
}));

type RowAction = "pause" | "resume" | "duplicate" | "delete";

function createdWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TH = "px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint";
const MENU_ITEM =
  "flex w-full items-center gap-2.5 px-4 py-2 text-sm text-ink-soft transition-colors hover:bg-cream hover:text-ink";

// ---- local components ------------------------------------------------------

function RowMenu({
  campaign,
  open,
  setMenuFor,
  busy,
  onAction,
}: {
  campaign: Campaign;
  open: boolean;
  setMenuFor: (id: number | null) => void;
  busy: boolean;
  onAction: (campaign: Campaign, action: RowAction) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  // The table lives in an overflow-x-auto wrapper (which also clips overflow-y),
  // so the dropdown is `fixed` (escapes overflow clipping) and anchored to the
  // kebab's viewport rect, measured at open time.
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFor(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setMenuFor]);

  // Only the transition that makes sense for the current status; Draft,
  // Completed and Failed rows get no pause/resume entry at all.
  const transition: RowAction | null =
    campaign.status === "Running" ? "pause" : campaign.status === "Paused" ? "resume" : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => {
          if (open) {
            setMenuFor(null);
            return;
          }
          const r = btnRef.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 4, right: Math.max(window.innerWidth - r.right, 8) });
          setMenuFor(campaign.id);
        }}
        aria-label={`Actions for ${campaign.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-cream hover:text-ink"
      >
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <MoreHorizontal size={16} strokeWidth={1.75} />
        )}
      </button>

      {open && (
        <>
          <button
            aria-label="Close menu"
            onClick={() => setMenuFor(null)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            role="menu"
            className="fixed z-40 w-48 rounded-xl border border-line bg-paper py-1.5 shadow-lg"
            style={{ top: pos.top, right: pos.right }}
          >
            {transition === "pause" && (
              <button role="menuitem" className={MENU_ITEM} onClick={() => onAction(campaign, "pause")}>
                <Pause size={15} strokeWidth={1.75} /> Pause
              </button>
            )}
            {transition === "resume" && (
              <button role="menuitem" className={MENU_ITEM} onClick={() => onAction(campaign, "resume")}>
                <Play size={15} strokeWidth={1.75} /> Resume
              </button>
            )}
            <button role="menuitem" className={MENU_ITEM} onClick={() => onAction(campaign, "duplicate")}>
              <Copy size={15} strokeWidth={1.75} /> Duplicate
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-rust transition-colors hover:bg-rust/5"
              onClick={() => onAction(campaign, "delete")}
            >
              <Trash2 size={15} strokeWidth={1.75} /> Delete…
            </button>
          </div>
        </>
      )}
    </>
  );
}

function CampaignRow({
  campaign,
  menuOpen,
  setMenuFor,
  busy,
  onAction,
}: {
  campaign: Campaign;
  menuOpen: boolean;
  setMenuFor: (id: number | null) => void;
  busy: boolean;
  onAction: (campaign: Campaign, action: RowAction) => void;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(`/campaigns/${campaign.id}`)}
      className="cursor-pointer transition-colors hover:bg-cream/60"
    >
      <td className="px-5 py-3">
        <Link
          href={`/campaigns/${campaign.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-ink hover:underline"
        >
          {campaign.name}
        </Link>
      </td>
      <td className="px-5 py-3">
        <Badge tone={CAMPAIGN_TONE[campaign.status]}>{campaign.status}</Badge>
      </td>
      <td className="px-5 py-3 text-right tabular-nums">{campaign.companies_uploaded}</td>
      <td className="px-5 py-3 text-right tabular-nums">{campaign.companies_researched}</td>
      <td className="px-5 py-3 text-right tabular-nums">{campaign.emails_sent}</td>
      <td className="px-5 py-3 text-right tabular-nums">{campaign.replies_received}</td>
      <td className="px-5 py-3 text-right tabular-nums">{campaign.meetings_booked}</td>
      <td className="whitespace-nowrap px-5 py-3 text-ink-soft">{createdWhen(campaign.created_at)}</td>
      {/* Kebab cell: clicks here must not trigger the row's navigation. */}
      <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <RowMenu
          campaign={campaign}
          open={menuOpen}
          setMenuFor={setMenuFor}
          busy={busy}
          onAction={onAction}
        />
      </td>
    </tr>
  );
}

// ---- page ------------------------------------------------------------------

export default function CampaignsPage() {
  const router = useRouter();
  const campaigns = useApi(api.campaigns);
  const { busy, run } = useAction();

  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);

  const handleAction = (c: Campaign, action: RowAction) => {
    setMenuFor(null);
    if (action === "delete") {
      setDeleting(c);
      return;
    }
    if (action === "duplicate") {
      void run(`duplicate:${c.id}`, () => api.duplicateCampaign(c.id), {
        success: "Campaign duplicated",
        onDone: () => campaigns.reload(),
      });
      return;
    }
    void run(
      `${action}:${c.id}`,
      () => api.updateCampaign(c.id, { status: action === "pause" ? "Paused" : "Running" }),
      {
        success: action === "pause" ? "Campaign paused" : "Campaign resumed",
        onDone: () => campaigns.reload(),
      },
    );
  };

  // Busy keys are "<action>:<id>" — the trailing ":<id>" match keeps the
  // spinner on the one affected row.
  const rowBusy = (id: number) => busy !== null && busy.endsWith(`:${id}`);

  const all = campaigns.data ?? [];
  const needle = query.trim().toLowerCase();
  const filtered = all.filter(
    (c) => (status === "All" || c.status === status) && c.name.toLowerCase().includes(needle),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Campaigns</h1>
        <Button variant="accent" onClick={() => router.push("/campaigns/new")}>
          New campaign
        </Button>
      </header>

      {campaigns.loading ? (
        <SkeletonRows n={5} />
      ) : campaigns.error ? (
        <ErrorCard message={campaigns.error} onRetry={campaigns.reload} />
      ) : all.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          line="The desert is quiet. Start your first expedition."
          action={
            <Button onClick={() => router.push("/campaigns/new")}>Start a campaign</Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Chips options={STATUS_FILTERS} selected={[status]} onToggle={setStatus} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search campaigns…"
              aria-label="Search campaigns"
              className="w-full sm:w-64"
            />
          </div>

          <Card flush>
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center font-serif italic text-ink-soft">
                No campaigns match those filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={TH}>Campaign</th>
                      <th className={TH}>Status</th>
                      <th className={`${TH} text-right`}>Companies</th>
                      <th className={`${TH} text-right`}>Researched</th>
                      <th className={`${TH} text-right`}>Sent</th>
                      <th className={`${TH} text-right`}>Replies</th>
                      <th className={`${TH} text-right`}>Meetings</th>
                      <th className={TH}>Created</th>
                      <th className="px-2 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map((c) => (
                      <CampaignRow
                        key={c.id}
                        campaign={c}
                        menuOpen={menuFor === c.id}
                        setMenuFor={setMenuFor}
                        busy={rowBusy(c.id)}
                        onAction={handleAction}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {deleting && (
        <ConfirmModal
          open
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const ok = await run(
              `delete:${deleting.id}`,
              () => api.deleteCampaign(deleting.id).then(() => true),
              { success: "Campaign deleted" },
            );
            // useAction swallows errors (returns null); re-throw so the modal
            // stays open on failure instead of closing as if it succeeded.
            if (!ok) throw new Error("delete failed");
            campaigns.reload();
          }}
          title="Delete campaign?"
          body={
            <p>
              <strong className="font-semibold text-ink">{deleting.name}</strong> and all of its
              companies, contacts, drafts and conversations will be permanently deleted.
            </p>
          }
          confirmLabel="Delete campaign"
          destructive
        />
      )}
    </div>
  );
}
