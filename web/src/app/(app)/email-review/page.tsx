"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAuth } from "@/components/AuthProvider";
import type { Contact, EmailDraft, EmailState } from "@/lib/api-types";

const stateTone: Record<EmailState, "neutral" | "info" | "ok" | "danger"> = {
  Queued: "neutral",
  Sent: "info",
  Delivered: "ok",
  Failed: "danger",
};

export default function EmailReviewPage() {
  const { user } = useAuth();
  const sendingOn = !!user?.outbound_enabled;
  const draftsQ = useApi(() => api.drafts(), []);
  const contactsQ = useApi(() => api.contacts(), []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const drafts = draftsQ.data ?? [];
  const contactMap = (contactsQ.data ?? []).reduce<Record<number, Contact>>((m, c) => {
    m[c.id] = c;
    return m;
  }, {});

  // Select the first draft once loaded.
  useEffect(() => {
    if (selectedId === null && drafts.length) {
      const d = drafts[0];
      setSelectedId(d.id);
      setSubject(d.subject);
      setBody(d.body);
      setFooter(d.footer);
    }
  }, [drafts, selectedId]);

  if (draftsQ.loading) return <Loading label="Loading drafts…" />;
  if (draftsQ.error) return <ErrorBox message={draftsQ.error} onRetry={draftsQ.reload} />;

  function select(d: EmailDraft) {
    setSelectedId(d.id);
    setSubject(d.subject);
    setBody(d.body);
    setFooter(d.footer);
  }
  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  const selected = drafts.find((d) => d.id === selectedId) ?? null;
  const contact = selected ? contactMap[selected.contact_id] : undefined;

  async function save() {
    if (!selected) return;
    await api.updateDraft(selected.id, { subject, body, footer });
  }
  async function regenerate() {
    if (!selected) return;
    setBusy(true);
    try {
      const d = await api.regenerateDraft(selected.id);
      setSubject(d.subject);
      setBody(d.body);
      draftsQ.reload();
      flash("AI regenerated the draft");
    } finally {
      setBusy(false);
    }
  }
  async function sendTest() {
    if (!selected) return;
    await save();
    const res = await api.testDraft(selected.id);
    flash(res.detail);
  }
  async function approveSend() {
    if (!selected) return;
    setBusy(true);
    try {
      await save();
      await api.sendFromDraft(selected.id);
      flash("Approved & sent — thread created in Conversations");
      draftsQ.reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  if (drafts.length === 0) {
    return (
      <div>
        <PageHeader title="Email Draft Review & Editor" subtitle="Review and refine AI-generated outreach before it sends." />
        <Card className="p-0">
          <div className="px-6 py-14 text-center">
            <h3 className="text-lg font-bold text-ink">No drafts yet</h3>
            <p className="mt-1 text-sm text-ink-500">Run a campaign to generate personalized outreach drafts.</p>
            <Button href="/campaigns/new" className="mt-4"><Icon.Plus width={16} height={16} /> New campaign</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Email Draft Review & Editor" subtitle="Review and refine AI-generated outreach before it sends." />

      {!sendingOn && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">
          <Icon.Info width={16} height={16} />
          <span className="font-semibold">Outbound sending is paused.</span>
          You can review and edit drafts, but nothing will be emailed until you turn sending on in{" "}
          <a href="/settings" className="font-semibold underline">Settings → Email</a>.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit overflow-hidden p-0">
          <CardHeader title={`Drafts (${drafts.length})`} />
          <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
            {drafts.map((d) => {
              const ct = contactMap[d.contact_id];
              return (
                <li key={d.id}>
                  <button
                    onClick={() => select(d)}
                    className={`w-full px-4 py-3 text-left ${d.id === selectedId ? "bg-brand/10" : "hover:bg-ink/5"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">{ct?.name ?? `Contact #${d.contact_id}`}</span>
                      <Badge tone={stateTone[d.state]}>{d.state}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">{ct?.role ?? ""}</p>
                    <p className="mt-1 truncate text-xs text-ink-300">{d.subject}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {selected && (
          <Card className={`p-0 ${busy ? "pointer-events-none opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-ink">
                  To: {contact?.name ?? `Contact #${selected.contact_id}`}
                </h3>
                <p className="text-xs text-ink-500">{contact?.role} · {contact?.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={regenerate}>
                  <Icon.Sparkle width={16} height={16} /> {busy ? "Working…" : "AI regenerate"}
                </Button>
                <Button variant="ghost" onClick={sendTest}>
                  <Icon.Mail width={16} height={16} /> Send test
                </Button>
                <Button onClick={approveSend} disabled={!sendingOn}>
                  <Icon.Check width={16} height={16} /> Approve &amp; send
                </Button>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-2">
              <div className="space-y-3 border-b border-line p-5 lg:border-b-0 lg:border-r">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-300">Editor</p>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-500">Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="form-input font-semibold" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-500">Body</label>
                  <div className="flex items-center gap-1 rounded-t-lg border border-b-0 border-line bg-peach-soft/60 px-2 py-1.5 text-ink-500">
                    {["B", "i", "U"].map((b) => (
                      <button key={b} className="h-7 w-7 rounded font-bold hover:bg-ink/10" style={{ fontStyle: b === "i" ? "italic" : undefined }}>{b}</button>
                    ))}
                    <span className="mx-1 h-5 w-px bg-line" />
                    <button className="h-7 rounded px-2 text-sm hover:bg-ink/10">Link</button>
                  </div>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="form-input rounded-t-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-500">Footer / signature</label>
                  <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={3} className="form-input text-xs" />
                </div>
              </div>

              <div className="p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-300">Recipient preview</p>
                <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <div className="border-b border-line pb-3">
                    <p className="text-xs text-ink-300">From: Jordan Pierce &lt;jordan@apexcloud.com&gt;</p>
                    <p className="text-xs text-ink-300">To: {contact?.email ?? "recipient"}</p>
                    <p className="mt-2 font-bold text-ink">{subject}</p>
                  </div>
                  <div className="whitespace-pre-wrap pt-3 text-sm leading-relaxed text-ink-700">{body}</div>
                  <div className="mt-4 whitespace-pre-wrap border-t border-line pt-3 text-xs text-ink-500">{footer}</div>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
