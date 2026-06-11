"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/components/AuthProvider";
import type { Contact, EmailDraft, Thread, ThreadDetail } from "@/lib/api-types";
import { DRAFT_TONE } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chips } from "@/components/ui/Chips";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { DraftEditor } from "@/components/outreach/DraftEditor";

// ---- page -------------------------------------------------------------------

function OutreachInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const campaigns = useApi(api.campaigns);

  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  // Threads opened by sends made in THIS session, keyed by draft id — the
  // freshest possible "View thread" target for a just-sent draft.
  const [sentThreads, setSentThreads] = useState<Record<number, number>>({});

  // Same one-directional chips↔URL sync as contacts: no/invalid ?campaign
  // means "All campaigns" (the drafts endpoint works unscoped).
  const all = campaigns.data ?? [];
  const param = Number(search.get("campaign"));
  const selected = all.find((c) => c.id === param) ?? null;
  const selectedId = selected?.id ?? null;

  // Don't fetch until campaigns resolve: a URL like ?campaign=3 would
  // otherwise fire an unscoped fetch first and flash every draft.
  const ready = campaigns.data !== null;
  const drafts = useApi<EmailDraft[] | null>(
    () => (ready ? api.drafts(selectedId ?? undefined) : Promise.resolve(null)),
    [ready, selectedId],
  );
  // Drafts carry only contact_id — join names/emails from the contacts list
  // (same scope), and resolve thread links for already-Sent drafts from the
  // threads list (a thread points back at its contact).
  const contacts = useApi<Contact[] | null>(
    () => (ready ? api.contacts(selectedId ?? undefined) : Promise.resolve(null)),
    [ready, selectedId],
  );
  const threads = useApi<Thread[] | null>(
    () => (ready ? api.threads(selectedId ?? undefined) : Promise.resolve(null)),
    [ready, selectedId],
  );

  const contactById = useMemo(() => {
    const map = new Map<number, Contact>();
    for (const c of contacts.data ?? []) map.set(c.id, c);
    return map;
  }, [contacts.data]);

  // Contact id → company display name (the contacts list already carries the
  // join the drafts list needs, via the threads rows' company_name; but the
  // canonical source is the company list — threads only exist after a send).
  const idsKey = (selectedId !== null ? [selectedId] : all.map((c) => c.id)).join(",");
  const companyNames = useApi<Record<number, string>>(async () => {
    const ids = idsKey === "" ? [] : idsKey.split(",").map(Number);
    const lists = await Promise.all(ids.map((id) => api.campaignCompanies(id)));
    const map: Record<number, string> = {};
    for (const list of lists) for (const c of list) map[c.id] = c.name;
    return map;
  }, [idsKey]);

  const threadByContact = useMemo(() => {
    const map = new Map<number, number>();
    // Walk oldest-first so the EARLIEST thread per contact wins — that's the
    // one the outreach draft opened (list comes newest-first).
    const rows = [...(threads.data ?? [])].reverse();
    for (const t of rows) if (t.contact_id != null) map.set(t.contact_id, t.id);
    return map;
  }, [threads.data]);

  const rows = drafts.data ?? [];
  const selectedDraft = rows.find((d) => d.id === selectedDraftId) ?? null;
  // Stale-while-reload: only the very first fetch gets a skeleton; later
  // reloads (chip switch, save, send) repaint in place.
  const initialLoad = drafts.loading && drafts.data === null;

  const draftMeta = (d: EmailDraft) => {
    const contact = contactById.get(d.contact_id);
    return {
      contactName: contact?.name ?? `Contact #${d.contact_id}`,
      contactEmail: contact?.email ?? "",
      companyName: contact ? (companyNames.data?.[contact.company_id] ?? "") : "",
    };
  };

  const onSent = (draftId: number) => (thread: ThreadDetail) => {
    setSentThreads((prev) => ({ ...prev, [draftId]: thread.id }));
    drafts.reload(); // the row flips to Sent; the editor goes read-only
    threads.reload();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Outbound kill-switch banner — pinned while sending is paused. The
          send button stays visible; the backend 403 is surfaced inline. */}
      {!me.outbound_enabled && (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 px-5 py-3 text-sm text-amber-deep">
          Outbound sending is paused — drafts can be edited and tested, but nothing
          reaches a prospect.{" "}
          <Link
            href="/settings?tab=sending"
            className="font-serif italic underline underline-offset-2 transition-opacity hover:opacity-80"
          >
            Turn on in Settings → Sending.
          </Link>
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl sm:text-4xl">Outreach</h1>
        {ready && drafts.data !== null && !drafts.error && (
          <p className="text-sm tabular-nums text-ink-soft">
            {rows.length} {rows.length === 1 ? "draft" : "drafts"}
          </p>
        )}
      </header>

      {campaigns.loading ? (
        <SkeletonRows n={6} />
      ) : campaigns.error ? (
        <ErrorCard message={campaigns.error} onRetry={campaigns.reload} />
      ) : all.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          line="The outreach writer drafts emails once a campaign pipeline runs."
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
                value === "all" ? "/outreach" : `/outreach?campaign=${value}`,
                { scroll: false },
              )
            }
          />

          {initialLoad ? (
            <SkeletonRows n={6} />
          ) : drafts.error ? (
            <ErrorCard message={drafts.error} onRetry={drafts.reload} />
          ) : rows.length === 0 ? (
            selected ? (
              <p className="py-10 text-center font-serif italic text-ink-soft">
                No drafts in this campaign yet.
              </p>
            ) : (
              <EmptyState
                title="No drafts yet"
                line="The outreach writer drafts emails once verified contacts exist."
                action={
                  <Button onClick={() => router.push("/campaigns")}>Open campaigns</Button>
                }
              />
            )
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
              {/* Drafts list */}
              <Card
                flush
                className={drafts.loading ? "opacity-60 transition-opacity" : "transition-opacity"}
              >
                <ul className="divide-y divide-line">
                  {rows.map((d) => {
                    const meta = draftMeta(d);
                    const active = d.id === selectedDraftId;
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedDraftId(d.id)}
                          className={`w-full px-5 py-3 text-left transition ${
                            active ? "bg-ink/5" : "hover:bg-ink/[0.03]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate font-medium text-ink">{meta.contactName}</p>
                            <Badge tone={DRAFT_TONE[d.state]}>{d.state}</Badge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-ink-faint">
                            {[meta.companyName, d.subject].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              {/* Editor pane */}
              {selectedDraft === null ? (
                <Card>
                  <p className="py-10 text-center font-serif italic text-ink-soft">
                    Select a draft to review.
                  </p>
                </Card>
              ) : (
                <DraftEditor
                  key={selectedDraft.id}
                  draft={selectedDraft}
                  contactName={draftMeta(selectedDraft).contactName}
                  contactEmail={draftMeta(selectedDraft).contactEmail}
                  threadId={
                    sentThreads[selectedDraft.id] ??
                    threadByContact.get(selectedDraft.contact_id) ??
                    null
                  }
                  onSaved={drafts.reload}
                  onSent={onSent(selectedDraft.id)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function OutreachPage() {
  // Next 16: useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl">
          <SkeletonRows n={6} />
        </div>
      }
    >
      <OutreachInner />
    </Suspense>
  );
}
