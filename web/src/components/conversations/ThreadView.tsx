"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useToast } from "@/components/ui/Toast";
import type { Contact, ThreadMessage } from "@/lib/api-types";
import { INTENT_TONE, STAGE_TONE, THREAD_STAGES } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/Modal";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Textarea } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { BookMeetingModal } from "./BookMeetingModal";

/** Absolute timestamp for message headers - mono, compact. */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBlock({ message, contactName }: { message: ThreadMessage; contactName: string }) {
  const fromUs = message.direction === "us";
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-ink">
          {fromUs ? "You" : contactName || message.author || "Prospect"}
        </p>
        {message.is_follow_up && <Badge tone="faint">Follow-up</Badge>}
        {!fromUs && message.intent && (
          <Badge tone={INTENT_TONE[message.intent]}>{message.intent.replace(/_/g, " ")}</Badge>
        )}
        <span className="ml-auto font-mono text-xs text-ink-faint">{stamp(message.sent_at)}</span>
      </div>
      {message.subject && (
        <p className="mt-1.5 text-sm font-semibold text-ink">{message.subject}</p>
      )}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
        {message.body}
      </p>
    </li>
  );
}

/**
 * One conversation: header with stage control + booking, the messages as
 * hairline-separated letters, the tracker's AI suggestion, and a reply
 * composer. The parent keys this on `threadId`, so switching threads remounts
 * it and all transient state (composer, menus) resets cleanly.
 */
export function ThreadView({
  threadId,
  onChanged,
}: {
  threadId: number;
  /** A mutation changed list-visible fields (stage, last_activity) - refetch the inbox. */
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { busy, run } = useAction();

  const detail = useApi(() => api.thread(threadId), [threadId]);
  // ThreadDetail doesn't carry do_not_contact - join it from the campaign's
  // contacts list (the same rows the contacts page reads).
  const campaignId = detail.data?.campaign_id ?? null;
  const contacts = useApi<Contact[] | null>(
    () => (campaignId !== null ? api.contacts(campaignId) : Promise.resolve(null)),
    [campaignId],
  );

  const [stageOpen, setStageOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [composer, setComposer] = useState("");
  // Reply is NOT run through useAction: a 403 must surface its backend detail
  // verbatim as an inline note under the composer (the DraftEditor pattern).
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  if (detail.error) {
    return <ErrorCard message={detail.error} onRetry={detail.reload} />;
  }
  if (detail.data === null) {
    return (
      <Card>
        <SkeletonRows n={5} />
      </Card>
    );
  }

  const t = detail.data;
  const contact =
    t.contact_id != null ? (contacts.data?.find((c) => c.id === t.contact_id) ?? null) : null;
  const optedOut = contact?.do_not_contact ?? false;

  const refetch = () => {
    detail.reload();
    contacts.reload(); // do_not_contact may have flipped (reopen)
    onChanged();
  };

  const setStage = (stage: string) =>
    void run("stage", () => api.overrideStage(threadId, { stage }), {
      success: `Stage set to ${stage}`,
      onDone: refetch,
    });

  const reopen = async () => {
    await run(
      "reopen",
      () => api.overrideStage(threadId, { stage: "Contacted", clear_do_not_contact: true }),
      { success: "Thread reopened. Outreach can resume.", onDone: refetch },
    );
  };

  const sendReply = async () => {
    const body = composer.trim();
    if (!body) return;
    setSending(true);
    setReplyError(null);
    try {
      await api.reply(threadId, body);
      toast("Reply sent", "success");
      setComposer("");
      refetch();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setReplyError(e.message);
      } else {
        toast(e instanceof ApiError ? e.message : "Something went wrong. Try again.", "error");
      }
    } finally {
      setSending(false);
    }
  };

  const suggestion = t.ai_suggestion ?? null;
  // One mutation at a time across the header actions AND an in-flight reply.
  const locked = busy !== null || sending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="display text-xl">{t.contact_name || "Unknown contact"}</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {[t.role, t.company_name].filter(Boolean).join(" · ") || "-"}
            </p>
            {t.email && <p className="mt-0.5 font-mono text-xs text-ink-faint">{t.email}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Stage menu */}
            <div className="relative">
              <Button
                variant="secondary"
                busy={busy === "stage"}
                disabled={locked}
                aria-haspopup="menu"
                aria-expanded={stageOpen}
                onClick={() => setStageOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setStageOpen(false);
                }}
              >
                {t.stage} <ChevronDown aria-hidden className="size-3.5" />
              </Button>
              {stageOpen && (
                <>
                  <button
                    aria-label="Close menu"
                    onClick={() => setStageOpen(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setStageOpen(false);
                    }}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-40 mt-1 w-44 rounded-xl border border-line bg-paper py-1.5 shadow-lg"
                  >
                    {THREAD_STAGES.map((s) => (
                      <button
                        key={s}
                        role="menuitem"
                        className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-sm transition-colors hover:bg-cream"
                        onClick={() => {
                          setStageOpen(false);
                          if (s !== t.stage) setStage(s);
                        }}
                      >
                        <Badge tone={STAGE_TONE[s]}>{s}</Badge>
                        {s === t.stage && (
                          <Check aria-hidden className="size-3.5 text-ink-soft" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {t.stage === "Closed" && (
              <Button
                variant="secondary"
                busy={busy === "reopen"}
                disabled={locked}
                onClick={() => setReopenOpen(true)}
              >
                Reopen
              </Button>
            )}
            <Button variant="accent" disabled={locked} onClick={() => setBookOpen(true)}>
              Book meeting
            </Button>
          </div>
        </div>

        <p className="mt-3 border-t border-line pt-3 text-sm font-semibold text-ink">
          {t.subject || "(no subject)"}
        </p>

        {optedOut && (
          <div className="mt-3 rounded-xl border border-rust/40 bg-rust/10 px-4 py-2.5 text-sm text-rust">
            This contact opted out. Every send path (replies, follow-ups, invites) is
            suppressed. Reopening the thread clears the do-not-contact flag.
          </div>
        )}
      </Card>

      {/* Messages as letters */}
      <Card flush className={detail.loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {t.messages.length === 0 ? (
          <p className="px-5 py-10 text-center font-serif italic text-ink-soft">
            No messages in this thread yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {t.messages.map((m) => (
              <MessageBlock key={m.id} message={m} contactName={t.contact_name} />
            ))}
          </ul>
        )}
      </Card>

      {/* AI suggestion from the follow-up tracker */}
      {suggestion && (
        <Card
          title="Suggested follow-up"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setComposer(suggestion);
                setReplyError(null);
              }}
            >
              Use this
            </Button>
          }
        >
          <p className="whitespace-pre-wrap font-serif text-sm italic leading-relaxed text-ink-soft">
            {suggestion}
          </p>
        </Card>
      )}

      {/* Composer */}
      <Card title="Reply">
        <Textarea
          rows={5}
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder="Write your reply…"
          aria-label="Reply"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            busy={sending}
            disabled={!composer.trim() || busy !== null}
            onClick={() => void sendReply()}
          >
            Send
          </Button>
          {replyError && <p className="text-sm text-rust">{replyError}</p>}
        </div>
      </Card>

      <ConfirmModal
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        onConfirm={reopen}
        title="Reopen thread"
        body={
          <p>
            Reopen this thread? This also clears the contact&apos;s do-not-contact flag so
            outreach can resume.
          </p>
        }
        confirmLabel="Reopen"
      />

      <BookMeetingModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        threadId={threadId}
        onBooked={refetch}
      />
    </div>
  );
}
