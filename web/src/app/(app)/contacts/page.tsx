"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Ban, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { Contact } from "@/lib/api-types";
import { VERIFICATION_TONE } from "@/lib/constants";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chips } from "@/components/ui/Chips";
import { ConfirmModal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";

// ---- helpers ---------------------------------------------------------------

const TH =
  "px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint";

// ---- local components ------------------------------------------------------

function ContactRow({
  contact,
  companyName,
  campaignId,
  onSaved,
  onRequestOptOut,
}: {
  contact: Contact;
  companyName: string;
  /** Carried into the company link so its "Back to research" keeps the campaign. */
  campaignId: number | null;
  onSaved: () => void;
  onRequestOptOut: (contact: Contact) => void;
}) {
  const { busy, run } = useAction();

  // Tri-state approval (same semantics as the company-detail contact table):
  // clicking the active state clears back to null (undecided), clicking the
  // other side flips it. Silent on success - the row repaints.
  const setApproval = (key: string, next: boolean | null) =>
    void run(key, () => api.updateContact(contact.id, { approved: next }), {
      onDone: onSaved,
    });

  // CLEARING do-not-contact is instant (bringing someone back is harmless);
  // SETTING it goes through the page-level ConfirmModal.
  const clearOptOut = () =>
    void run("optout", () => api.updateContact(contact.id, { do_not_contact: false }), {
      success: `${contact.name} is contactable again`,
      onDone: onSaved,
    });

  const toggle =
    "inline-flex size-7 items-center justify-center rounded-full border transition disabled:pointer-events-none disabled:opacity-50";

  return (
    <tr className={contact.do_not_contact ? "bg-rust/[0.04]" : undefined}>
      <td className="px-5 py-3">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-ink">{contact.name}</p>
          {contact.linkedin && (
            <a
              href={contact.linkedin}
              target="_blank"
              rel="noreferrer"
              aria-label={`${contact.name} on LinkedIn`}
              className="text-ink-faint transition-colors hover:text-ink"
            >
              <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-faint">{contact.role || "-"}</p>
      </td>
      <td className="px-5 py-3">
        <Link
          href={
            campaignId !== null
              ? `/research/${contact.company_id}?campaign=${campaignId}`
              : `/research/${contact.company_id}`
          }
          className="text-ink underline-offset-2 transition-colors hover:underline"
        >
          {companyName}
        </Link>
      </td>
      <td className="px-5 py-3 font-mono text-xs text-ink-soft">
        {contact.email || "-"}
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={VERIFICATION_TONE[contact.verification]}>
            {contact.verification}
          </Badge>
          {contact.do_not_contact && <Badge tone="rust">Opted out</Badge>}
        </div>
      </td>
      <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
        {contact.confidence}
      </td>
      <td className="px-5 py-3">
        <div className="flex justify-end gap-1.5">
          <button
            aria-label={contact.approved === true ? "Clear approval" : "Approve contact"}
            aria-pressed={contact.approved === true}
            disabled={busy !== null}
            onClick={() => setApproval("approve", contact.approved === true ? null : true)}
            className={`${toggle} ${
              contact.approved === true
                ? "border-moss bg-moss/10 text-moss"
                : "border-line text-ink-faint hover:border-moss/50 hover:text-moss"
            }`}
          >
            <Check aria-hidden className="size-3.5" />
          </button>
          <button
            aria-label={contact.approved === false ? "Clear rejection" : "Reject contact"}
            aria-pressed={contact.approved === false}
            disabled={busy !== null}
            onClick={() => setApproval("reject", contact.approved === false ? null : false)}
            className={`${toggle} ${
              contact.approved === false
                ? "border-rust bg-rust/10 text-rust"
                : "border-line text-ink-faint hover:border-rust/50 hover:text-rust"
            }`}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      </td>
      <td className="px-5 py-3">
        <div className="flex justify-end">
          <button
            aria-label={
              contact.do_not_contact
                ? `Resume contacting ${contact.name}`
                : `Stop contacting ${contact.name}`
            }
            aria-pressed={contact.do_not_contact}
            disabled={busy !== null}
            onClick={() =>
              contact.do_not_contact ? clearOptOut() : onRequestOptOut(contact)
            }
            className={`${toggle} ${
              contact.do_not_contact
                ? "border-rust bg-rust/10 text-rust"
                : "border-line text-ink-faint hover:border-rust/50 hover:text-rust"
            }`}
          >
            <Ban aria-hidden className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---- page ------------------------------------------------------------------

function ContactsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const campaigns = useApi(api.campaigns);
  const { run } = useAction();
  const [optOutTarget, setOptOutTarget] = useState<Contact | null>(null);

  // Same one-directional chips↔URL sync as research, with one extra option:
  // no/invalid ?campaign means "All campaigns" (the contacts endpoint works
  // unscoped), not "first campaign".
  const all = campaigns.data ?? [];
  const param = Number(search.get("campaign"));
  const selected = all.find((c) => c.id === param) ?? null;
  const selectedId = selected?.id ?? null;

  // Don't fetch contacts until campaigns resolve: a URL like ?campaign=3 would
  // otherwise fire an unscoped fetch first and flash every contact. `null`
  // (instead of []) keeps the skeleton up while we wait.
  const ready = campaigns.data !== null;
  const contacts = useApi<Contact[] | null>(
    () => (ready ? api.contacts(selectedId ?? undefined) : Promise.resolve(null)),
    [ready, selectedId],
  );

  // The contacts list carries only company_id - resolve names from the company
  // lists (one fetch when scoped, parallel fetches across campaigns for "All").
  const idsKey = (selectedId !== null ? [selectedId] : all.map((c) => c.id)).join(",");
  const companyNames = useApi<Record<number, string>>(async () => {
    const ids = idsKey === "" ? [] : idsKey.split(",").map(Number);
    const lists = await Promise.all(ids.map((id) => api.campaignCompanies(id)));
    const map: Record<number, string> = {};
    for (const list of lists) for (const c of list) map[c.id] = c.name;
    return map;
  }, [idsKey]);

  const rows = contacts.data ?? [];
  // Stale-while-reload: only the very first fetch gets a skeleton; later
  // reloads (chip switch, toggle saves) repaint in place - no table flash.
  const initialLoad = contacts.loading && contacts.data === null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {selected && <BackLink href={`/campaigns/${selected.id}`} label="Back to campaign" />}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Contacts</h1>
        {ready && contacts.data !== null && !contacts.error && (
          <p className="text-sm tabular-nums text-ink-soft">
            {rows.length} {rows.length === 1 ? "contact" : "contacts"}
          </p>
        )}
      </header>

      {campaigns.loading ? (
        <SkeletonRows n={6} />
      ) : campaigns.error ? (
        <ErrorCard message={campaigns.error} onRetry={campaigns.reload} />
      ) : all.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          line="The agents find decision-makers once a campaign pipeline runs."
          action={
            <Button onClick={() => router.push("/campaigns/new")}>Start a campaign</Button>
          }
        />
      ) : (
        <>
          <Chips
            options={[
              { value: "all", label: "All campaigns" },
              ...all.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
            selected={[selectedId !== null ? String(selectedId) : "all"]}
            onToggle={(value) =>
              router.replace(
                value === "all" ? "/contacts" : `/contacts?campaign=${value}`,
                { scroll: false },
              )
            }
          />

          {initialLoad ? (
            <SkeletonRows n={6} />
          ) : contacts.error ? (
            <ErrorCard message={contacts.error} onRetry={contacts.reload} />
          ) : rows.length === 0 ? (
            selected ? (
              <p className="py-10 text-center font-serif italic text-ink-soft">
                No contacts in this campaign yet.
              </p>
            ) : (
              <EmptyState
                title="No contacts yet"
                line="The agents find decision-makers once a campaign pipeline runs."
                action={
                  <Button onClick={() => router.push("/campaigns")}>Open campaigns</Button>
                }
              />
            )
          ) : (
            <Card
              flush
              className={contacts.loading ? "opacity-60 transition-opacity" : "transition-opacity"}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={TH}>Contact</th>
                      <th className={TH}>Company</th>
                      <th className={TH}>Email</th>
                      <th className={TH}>Verification</th>
                      <th className={`${TH} text-right`}>Confidence</th>
                      <th className={`${TH} text-right`}>Review</th>
                      <th className={`${TH} text-right`}>Opt-out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((ct) => (
                      <ContactRow
                        key={ct.id}
                        contact={ct}
                        companyName={
                          companyNames.data?.[ct.company_id] ??
                          `Company #${ct.company_id}`
                        }
                        campaignId={selectedId}
                        onSaved={contacts.reload}
                        onRequestOptOut={setOptOutTarget}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Page-level (a modal can't live inside <tbody>); one instance serves
          every row. Failure keeps it open; useAction toasts, we re-throw. */}
      <ConfirmModal
        open={optOutTarget !== null}
        onClose={() => setOptOutTarget(null)}
        title={`Stop contacting ${optOutTarget?.name ?? "this contact"}?`}
        body={
          <p>
            Every send path will skip them: outreach drafts, follow-ups and
            meeting invites.
          </p>
        }
        confirmLabel="Opt out"
        destructive
        onConfirm={async () => {
          if (!optOutTarget) return;
          const r = await run(
            "optout",
            () => api.updateContact(optOutTarget.id, { do_not_contact: true }),
            { success: `${optOutTarget.name} opted out`, onDone: contacts.reload },
          );
          if (r === null) throw new Error("opt-out failed");
        }}
      />
    </div>
  );
}

export default function ContactsPage() {
  // Next 16: useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl">
          <SkeletonRows n={6} />
        </div>
      }
    >
      <ContactsInner />
    </Suspense>
  );
}
