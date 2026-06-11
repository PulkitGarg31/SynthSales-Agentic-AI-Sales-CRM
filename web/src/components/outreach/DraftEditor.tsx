"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useToast } from "@/components/ui/Toast";
import type { EmailDraft, ThreadDetail } from "@/lib/api-types";
import { DRAFT_TONE } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";

// ---- letter preview ---------------------------------------------------------

/** The email as the prospect will read it, typeset on paper. */
function LetterPreview({
  contactName,
  contactEmail,
  subject,
  body,
  footer,
}: {
  contactName: string;
  contactEmail: string;
  subject: string;
  body: string;
  footer: string;
}) {
  return (
    <Card>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
        Letter preview
      </p>
      <p className="mt-3 text-sm text-ink-soft">
        To: {contactName}{" "}
        <span className="font-mono text-xs">
          {contactEmail ? `<${contactEmail}>` : "(no address yet)"}
        </span>
      </p>
      <p className="mt-2 text-sm font-semibold text-ink">
        {subject || <span className="font-normal italic text-ink-faint">No subject</span>}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
        {body || <span className="italic text-ink-faint">Empty body</span>}
      </p>
      {footer && (
        <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3 text-xs text-ink-faint">
          {footer}
        </p>
      )}
    </Card>
  );
}

// ---- editor -------------------------------------------------------------------

/**
 * Review room for one draft. The parent keys this component on `draft.id`, so
 * switching selection remounts it and the fields re-seed cleanly.
 *
 * Sent drafts are read-only: the letter as it actually went out, plus a link
 * to the conversation thread it opened.
 */
export function DraftEditor({
  draft,
  contactName,
  contactEmail,
  threadId,
  onSaved,
  onSent,
}: {
  draft: EmailDraft;
  contactName: string;
  contactEmail: string;
  /** Thread the draft opened (known for Sent drafts), if resolvable. */
  threadId: number | null;
  /** Refetch the drafts list (subject/state may have changed). */
  onSaved: () => void;
  /** A send succeeded — the response is the freshly-opened thread. */
  onSent: (thread: ThreadDetail) => void;
}) {
  const { busy, run } = useAction();
  const { toast } = useToast();

  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [footer, setFooter] = useState(draft.footer);

  // Approve & send is NOT run through useAction: a 403 (outbound paused /
  // do-not-contact) must surface its backend detail verbatim as an inline
  // note under the button, which useAction's toast-and-return-null swallows.
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const sent = draft.state === "Sent" || draft.state === "Delivered";
  const threadHref = threadId !== null ? `/conversations?thread=${threadId}` : "/conversations";

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Badge tone={DRAFT_TONE[draft.state]}>{draft.state}</Badge>
            <p className="text-sm text-ink-soft">
              This email went out — the draft is closed for edits.
            </p>
          </div>
          <Link
            href={threadHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-ink underline-offset-2 hover:underline"
          >
            View thread <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </div>
        <LetterPreview
          contactName={contactName}
          contactEmail={contactEmail}
          subject={draft.subject}
          body={draft.body}
          footer={draft.footer}
        />
      </div>
    );
  }

  const dirty =
    subject !== draft.subject || body !== draft.body || footer !== draft.footer;

  const save = () =>
    void run("save", () => api.updateDraft(draft.id, { subject, body, footer }), {
      success: "Draft saved",
      onDone: onSaved,
    });

  const regenerate = () =>
    void run("regen", () => api.regenerateDraft(draft.id), {
      success: "Draft rewritten",
      onDone: (fresh) => {
        setSubject(fresh.subject);
        setBody(fresh.body);
        setFooter(fresh.footer);
        onSaved();
      },
    });

  const sendTest = () =>
    void run("test", () => api.testDraft(draft.id), {
      success: (r) => `Test sent to you (${r.mode})`,
    });

  const approveAndSend = async () => {
    setSending(true);
    setSendError(null);
    try {
      // The backend sends the STORED draft — persist edits first so the
      // letter previewed here is the letter that actually goes out.
      if (dirty) await api.updateDraft(draft.id, { subject, body, footer });
      const thread = await api.sendFromDraft(draft.id);
      toast(`Sent to ${contactName}`, "success");
      onSent(thread);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setSendError(e.message);
      } else {
        toast(e instanceof ApiError ? e.message : "Something went wrong. Try again.", "error");
      }
    } finally {
      setSending(false);
    }
  };

  // One mutation at a time: each button shows its own spinner, the rest lock.
  const lock = (key: string) => (busy !== null && busy !== key) || sending;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <Field label="Subject" htmlFor="draft-subject">
          <Input
            id="draft-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>
        <Field label="Body" htmlFor="draft-body">
          <Textarea
            id="draft-body"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Field
          label="Footer"
          htmlFor="draft-footer"
          hint="Signature and compliance lines, separated from the body in the email."
        >
          <Textarea
            id="draft-footer"
            rows={3}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
          />
        </Field>
      </div>

      <LetterPreview
        contactName={contactName}
        contactEmail={contactEmail}
        subject={subject}
        body={body}
        footer={footer}
      />

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" busy={busy === "save"} disabled={lock("save")} onClick={save}>
            Save
          </Button>
          <Button
            variant="secondary"
            busy={busy === "regen"}
            disabled={lock("regen")}
            onClick={regenerate}
          >
            {busy === "regen" ? "Rewriting…" : "Regenerate"}
          </Button>
          <Button variant="secondary" busy={busy === "test"} disabled={lock("test")} onClick={sendTest}>
            Send test
          </Button>
          <Button
            variant="accent"
            busy={sending}
            disabled={busy !== null}
            onClick={() => void approveAndSend()}
          >
            Approve &amp; send
          </Button>
        </div>
        {sendError && <p className="mt-2 text-sm text-rust">{sendError}</p>}
      </div>
    </div>
  );
}
