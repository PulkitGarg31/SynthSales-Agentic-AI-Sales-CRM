"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { AdminCampaignRow, AdminUserRow, HealthOut } from "@/lib/api-types";
import { useAuth } from "@/components/AuthProvider";
import { CampaignInspector } from "@/components/admin/CampaignInspector";
import { UserTreeDrawer } from "@/components/admin/UserTreeDrawer";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ConfirmModal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { StatNumeral } from "@/components/ui/StatNumeral";
import { Tabs } from "@/components/ui/Tabs";
import { CAMPAIGN_TONE } from "@/lib/constants";

const TAB_VALUES = ["overview", "users", "campaigns"] as const;
type Tab = (typeof TAB_VALUES)[number];

const TH = "px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint";
const ICON_BTN =
  "rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-cream hover:text-ink disabled:pointer-events-none disabled:opacity-50";

// Open-in-new-tab modifiers and in-progress text selection must not trigger a
// row's drill-down (the campaigns-list row idiom).
function rowClickGuarded(e: React.MouseEvent, open: () => void) {
  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  if (window.getSelection()?.toString()) return;
  open();
}

function Dash() {
  return <span className="text-ink-faint">-</span>;
}

// ---- overview tab ------------------------------------------------------------

// Compact integration row: name + state chip + one-line meaning.
function HealthRow({ name, ok, chip, note }: { name: string; ok: boolean; chip: string; note: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
      <span className="w-36 shrink-0 text-sm font-medium text-ink">{name}</span>
      <Badge tone={ok ? "moss" : "amber"}>{chip}</Badge>
      <span className="min-w-0 flex-1 text-xs text-ink-soft">{note}</span>
    </li>
  );
}

function SystemHealth({ health }: { health: HealthOut }) {
  const i = health.integrations;
  const sendLive = i.email_mode !== "console";
  return (
    <Card title="System health" flush>
      <ul className="divide-y divide-line">
        <HealthRow
          name="AI providers"
          ok={i.ai}
          chip={i.ai ? "Connected" : "Off"}
          note={i.ai ? "Research, scoring and drafting run at full depth." : "Agents fall back to deterministic heuristics."}
        />
        <HealthRow
          name="Web search"
          ok={i.search}
          chip={i.search ? "DuckDuckGo" : "Off"}
          note={i.search ? "Enrichment and the people finder can reach the web." : "Enrichment and the people finder are blind."}
        />
        <HealthRow
          name="Email verification"
          ok={!i.email_verification.startsWith("free")}
          chip={i.email_verification}
          note={
            i.email_verification.startsWith("free")
              ? "Without a paid verifier, contacts stay Unknown."
              : "Mailboxes are confirmed before any draft is written."
          }
        />
        <HealthRow
          name="Email finder"
          ok={i.email_finder !== "off"}
          chip={i.email_finder}
          note={i.email_finder === "off" ? "Falls back to domain discovery + pattern guessing." : "One lookup per company for the top contact."}
        />
        <HealthRow
          name="Email sending"
          ok={sendLive}
          chip={i.email_mode}
          note={sendLive ? "Real delivery for OTPs, outreach and follow-ups." : "Console mode: emails are logged, nothing is delivered."}
        />
        <HealthRow
          name="Google OAuth"
          ok={i.google_oauth}
          chip={i.google_oauth ? "Configured" : "Off"}
          note={i.google_oauth ? "Sign-in, Calendar and mailbox connections available." : "Google sign-in and connections are unavailable."}
        />
      </ul>
    </Card>
  );
}

function OverviewTab({
  users,
  campaigns,
  onOpenUser,
}: {
  users: AdminUserRow[];
  campaigns: AdminCampaignRow[];
  onOpenUser: (u: AdminUserRow) => void;
}) {
  const health = useApi(api.health);

  const verified = users.filter((u) => u.is_verified).length;
  const sending = users.filter((u) => u.outbound_enabled).length;
  const totals = {
    companies: users.reduce((n, u) => n + u.companies, 0),
    contacts: users.reduce((n, u) => n + u.contacts, 0),
    drafts: campaigns.reduce((n, c) => n + c.drafts, 0),
  };
  const topTenants = [...users]
    .sort((a, b) => b.contacts - a.contacts || b.companies - a.companies)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Site-wide numbers */}
      <Card>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          <StatNumeral value={users.length} label="Users" />
          <StatNumeral value={`${verified}/${users.length}`} label="Verified" />
          <StatNumeral value={sending} label="Sending on" />
          <StatNumeral value={campaigns.length} label="Campaigns" />
          <StatNumeral value={totals.companies} label="Companies" />
          <StatNumeral value={totals.contacts} label="Contacts" />
        </div>
      </Card>

      {/* Integrations, live from /health */}
      {health.loading ? (
        <SkeletonRows n={4} />
      ) : health.error ? (
        <ErrorCard message={health.error} onRetry={health.reload} />
      ) : health.data ? (
        <SystemHealth health={health.data} />
      ) : null}

      {/* Heaviest tenants */}
      <Card title="Most active users" flush>
        <ul className="divide-y divide-line">
          {topTenants.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onOpenUser(u)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left transition-colors hover:bg-cream/60"
              >
                <span className="min-w-0 text-sm font-medium text-ink">{u.name}</span>
                <span className="min-w-0 font-mono text-xs text-ink-soft">{u.email}</span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-soft">
                  {u.campaigns} campaigns · {u.companies} companies · {u.contacts} contacts
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---- users tab ---------------------------------------------------------------

function UsersTable({
  rows,
  busyFor,
  onOpen,
  onSetAdmin,
  onDelete,
}: {
  rows: AdminUserRow[];
  busyFor: (id: number) => boolean;
  onOpen: (u: AdminUserRow) => void;
  onSetAdmin: (u: AdminUserRow) => void;
  onDelete: (u: AdminUserRow) => void;
}) {
  return (
    <Card flush>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>Name</th>
              <th className={TH}>Email</th>
              <th className={TH}>Verified</th>
              <th className={TH}>Outbound</th>
              <th className={TH}>Admin</th>
              <th className={`${TH} text-right`}>Campaigns</th>
              <th className={`${TH} text-right`}>Companies</th>
              <th className={`${TH} text-right`}>Contacts</th>
              <th className="px-2 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => (
              <tr
                key={u.id}
                onClick={(e) => rowClickGuarded(e, () => onOpen(u))}
                className="cursor-pointer transition-colors hover:bg-cream/60"
              >
                <td className="px-5 py-3 font-medium text-ink">{u.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-ink-soft">{u.email}</td>
                <td className="px-5 py-3">
                  {u.is_verified ? (
                    <>
                      <Check aria-hidden size={16} strokeWidth={2} className="text-moss" />
                      <span className="sr-only">Verified</span>
                    </>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="px-5 py-3">
                  {u.outbound_enabled ? <Badge tone="moss">On</Badge> : <Dash />}
                </td>
                <td className="px-5 py-3">
                  {u.is_admin ? <Badge tone="terracotta">Admin</Badge> : <Dash />}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{u.campaigns}</td>
                <td className="px-5 py-3 text-right tabular-nums">{u.companies}</td>
                <td className="px-5 py-3 text-right tabular-nums">{u.contacts}</td>
                {/* Action cell: clicks here must not open the drawer. */}
                <td
                  className="whitespace-nowrap px-2 py-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={busyFor(u.id)}
                    aria-label={u.is_admin ? `Revoke admin from ${u.name}` : `Grant admin to ${u.name}`}
                    title={u.is_admin ? "Revoke admin" : "Grant admin"}
                    onClick={() => onSetAdmin(u)}
                    className={ICON_BTN}
                  >
                    {u.is_admin ? (
                      <ShieldOff size={15} strokeWidth={1.75} />
                    ) : (
                      <ShieldCheck size={15} strokeWidth={1.75} />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busyFor(u.id)}
                    aria-label={`Delete ${u.name}`}
                    title="Delete user"
                    onClick={() => onDelete(u)}
                    className="rounded-lg p-1.5 text-rust transition-colors hover:bg-rust/5 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Trash2 size={15} strokeWidth={1.75} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---- campaigns tab -----------------------------------------------------------

function CampaignsTable({
  rows,
  onOpen,
}: {
  rows: AdminCampaignRow[];
  onOpen: (c: AdminCampaignRow) => void;
}) {
  return (
    <Card flush>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={`${TH} text-right`}>ID</th>
              <th className={TH}>Campaign</th>
              <th className={`${TH} text-right`}>Owner</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Top N</th>
              <th className={`${TH} text-right`}>Companies</th>
              <th className={`${TH} text-right`}>Contacts</th>
              <th className={`${TH} text-right`}>Drafts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={(e) => rowClickGuarded(e, () => onOpen(c))}
                className="cursor-pointer transition-colors hover:bg-cream/60"
              >
                <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-ink-faint">
                  {c.id}
                </td>
                <td className="px-5 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{c.owner_id}</td>
                <td className="px-5 py-3">
                  <Badge tone={CAMPAIGN_TONE[c.status] ?? "faint"}>{c.status}</Badge>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{c.top_n}</td>
                <td className="px-5 py-3 text-right tabular-nums">{c.companies}</td>
                <td className="px-5 py-3 text-right tabular-nums">{c.contacts}</td>
                <td className="px-5 py-3 text-right tabular-nums">{c.drafts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---- page --------------------------------------------------------------------

function AdminInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { busy, run } = useAction();

  const users = useApi(api.adminUsers);
  const campaigns = useApi(api.adminCampaigns);

  const rawTab = search.get("tab");
  const tab: Tab = (TAB_VALUES as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as Tab)
    : "overview";

  const [treeFor, setTreeFor] = useState<AdminUserRow | null>(null);
  const [inspecting, setInspecting] = useState<AdminCampaignRow | null>(null);
  const [adminChange, setAdminChange] = useState<{ user: AdminUserRow; value: boolean } | null>(
    null,
  );
  const [deletingUser, setDeletingUser] = useState<AdminUserRow | null>(null);

  // Stable closers: the Drawer's focus/scroll-lock effect depends on onClose.
  const closeTree = useCallback(() => setTreeFor(null), []);
  const closeInspector = useCallback(() => setInspecting(null), []);
  const campaignsReload = campaigns.reload;
  const onCampaignDeleted = useCallback(() => {
    setInspecting(null);
    campaignsReload();
  }, [campaignsReload]);

  // Busy keys end in ":<id>" so each row disables only its own buttons.
  const userBusy = (id: number) => busy !== null && busy.endsWith(`:${id}`);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-4">
        {/* Distinct admin chrome: the band strip marks "you are in admin mode". */}
        <div className="rounded-2xl bg-band px-6 py-5">
          <Eyebrow>Site administration</Eyebrow>
          <h1 className="display mt-1.5 text-3xl text-ink sm:text-4xl">Control room</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Cross-tenant oversight: every user, every campaign, the whole system.
          </p>
        </div>
        <Tabs
          value={tab}
          onChange={(v) => router.replace(`/admin?tab=${v}`)}
          items={[
            { value: "overview", label: "Overview" },
            { value: "users", label: "Users", count: users.data?.length },
            { value: "campaigns", label: "Campaigns", count: campaigns.data?.length },
          ]}
        />
      </header>

      {tab === "overview" &&
        (users.loading || campaigns.loading ? (
          <SkeletonRows n={5} />
        ) : users.error ? (
          <ErrorCard message={users.error} onRetry={users.reload} />
        ) : campaigns.error ? (
          <ErrorCard message={campaigns.error} onRetry={campaigns.reload} />
        ) : (
          <OverviewTab
            users={users.data ?? []}
            campaigns={campaigns.data ?? []}
            onOpenUser={setTreeFor}
          />
        ))}

      {tab === "users" &&
        (users.loading ? (
          <SkeletonRows n={5} />
        ) : users.error ? (
          <ErrorCard message={users.error} onRetry={users.reload} />
        ) : (users.data ?? []).length === 0 ? (
          <EmptyState title="No users" line="Nobody has signed up yet." />
        ) : (
          <UsersTable
            rows={users.data ?? []}
            busyFor={userBusy}
            onOpen={setTreeFor}
            onSetAdmin={(u) => setAdminChange({ user: u, value: !u.is_admin })}
            onDelete={setDeletingUser}
          />
        ))}

      {tab === "campaigns" &&
        (campaigns.loading ? (
          <SkeletonRows n={5} />
        ) : campaigns.error ? (
          <ErrorCard message={campaigns.error} onRetry={campaigns.reload} />
        ) : (campaigns.data ?? []).length === 0 ? (
          <EmptyState title="No campaigns" line="No user has started a campaign yet." />
        ) : (
          <CampaignsTable rows={campaigns.data ?? []} onOpen={setInspecting} />
        ))}

      {treeFor && <UserTreeDrawer userId={treeFor.id} onClose={closeTree} />}

      {inspecting && (
        <CampaignInspector
          campaignId={inspecting.id}
          onClose={closeInspector}
          onDeleted={onCampaignDeleted}
          onChanged={campaignsReload}
        />
      )}

      {adminChange && (
        <ConfirmModal
          open
          onClose={() => setAdminChange(null)}
          onConfirm={async () => {
            const { user, value } = adminChange;
            const ok = await run(
              `set-admin:${user.id}`,
              () => api.adminSetAdmin(user.id, value),
              { success: value ? "Admin granted" : "Admin revoked" },
            );
            // useAction swallows errors (a self-demote 400's detail already
            // toasted); re-throw so the modal stays open on failure.
            if (!ok) throw new Error("set-admin failed");
            users.reload();
          }}
          title={
            adminChange.value
              ? `Grant admin to ${adminChange.user.name}?`
              : `Revoke admin from ${adminChange.user.name}?`
          }
          body={
            adminChange.value ? (
              <p>
                Admins get cross-tenant access: they can browse and delete{" "}
                <strong className="font-semibold text-ink">every user&apos;s</strong> campaigns,
                companies, contacts and drafts, and manage other accounts.
              </p>
            ) : (
              <p>
                <strong className="font-semibold text-ink">{adminChange.user.name}</strong> loses
                cross-tenant access immediately and keeps only their own data.
              </p>
            )
          }
          confirmLabel={adminChange.value ? "Grant admin" : "Revoke admin"}
        />
      )}

      {deletingUser && (
        <ConfirmModal
          open
          onClose={() => setDeletingUser(null)}
          onConfirm={async () => {
            const ok = await run(
              `delete-user:${deletingUser.id}`,
              () => api.adminDeleteUser(deletingUser.id).then(() => true),
              { success: "User deleted" },
            );
            if (!ok) throw new Error("delete failed");
            users.reload();
            // Their campaigns vanish from the cross-tenant list too.
            campaigns.reload();
          }}
          title={`Delete ${deletingUser.name}?`}
          body={
            <p>
              Deletes the account{" "}
              <strong className="font-semibold text-ink">{deletingUser.email}</strong> and every
              campaign, company, contact, draft, thread and meeting it owns. This cannot be
              undone.
            </p>
          }
          confirmLabel="Delete user"
          destructive
          typedPhrase="confirm"
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  const { me } = useAuth();

  // Defense in depth: the sidebar hides this route for non-admins and the
  // backend 403s anyway, but a pasted URL must not render the admin chrome.
  if (!me.is_admin) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="display text-3xl sm:text-4xl">Admin</h1>
        <EmptyState
          title="Admin access required"
          line="This area is reserved for SynthSales administrators."
        />
      </div>
    );
  }

  // Next 16: useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl">
          <SkeletonRows n={5} />
        </div>
      }
    >
      <AdminInner />
    </Suspense>
  );
}
