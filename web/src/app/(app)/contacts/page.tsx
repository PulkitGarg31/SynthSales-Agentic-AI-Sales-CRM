"use client";

import { useEffect, useState } from "react";
import { Badge, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Contact, VerificationStatus } from "@/lib/api-types";

const verifTone: Record<VerificationStatus, "ok" | "warn" | "danger" | "neutral"> = {
  Verified: "ok",
  Risky: "warn",
  Invalid: "danger",
  Unknown: "neutral",
};

export default function ContactsPage() {
  // Companies don't carry their name on the Contact payload, so fetch companies
  // per campaign to resolve names. Simpler: derive grouping from company_id via a lookup.
  const contactsQ = useApi(() => api.contacts(), []);
  const campaignsQ = useApi(() => api.campaigns(), []);
  const [list, setList] = useState<Contact[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [companyNames, setCompanyNames] = useState<Record<number, string>>({});

  const data = list ?? contactsQ.data;
  const campaignsData = campaignsQ.data;

  // Build a company-id → name map from all campaigns' companies.
  useEffect(() => {
    if (!campaignsData) return;
    let active = true;
    (async () => {
      const map: Record<number, string> = {};
      for (const c of campaignsData) {
        try {
          const cos = await api.campaignCompanies(c.id);
          cos.forEach((co) => (map[co.id] = co.name));
        } catch {
          /* ignore */
        }
      }
      if (active) setCompanyNames(map);
    })();
    return () => {
      active = false;
    };
  }, [campaignsData]);

  if (contactsQ.loading) return <Loading label="Loading contacts…" />;
  if (contactsQ.error) return <ErrorBox message={contactsQ.error} onRetry={contactsQ.reload} />;

  const contacts = data ?? [];
  const grouped = contacts.reduce<Record<number, Contact[]>>((acc, c) => {
    (acc[c.company_id] ??= []).push(c);
    return acc;
  }, {});

  async function setApproved(id: number, approved: boolean) {
    const updated = await api.updateContact(id, { approved });
    setList((contacts).map((c) => (c.id === id ? updated : c)));
  }
  async function saveEdit(id: number) {
    const updated = await api.updateContact(id, { email: draftEmail });
    setList((contacts).map((c) => (c.id === id ? updated : c)));
    setEditing(null);
  }
  async function setDnc(id: number, do_not_contact: boolean) {
    const updated = await api.updateContact(id, { do_not_contact });
    setList((contacts).map((c) => (c.id === id ? updated : c)));
  }

  const pending = contacts.filter((c) => c.approved === null).length;

  return (
    <div>
      <PageHeader
        title="Contact Discovery Review"
        subtitle="Human approval layer — review discovered decision-makers before outreach."
        actions={<Badge tone="warn">{pending} pending review</Badge>}
      />

      {contacts.length === 0 ? (
        <Card className="p-0">
          <div className="px-6 py-14 text-center">
            <h3 className="text-lg font-bold text-ink">No contacts yet</h3>
            <p className="mt-1 text-sm text-ink-500">
              Run a campaign or use “Find contacts” on a company to discover decision-makers.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([companyId, members]) => (
            <Card key={companyId} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-line bg-peach-soft/60 px-5 py-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-ink">
                  {companyNames[Number(companyId)] ?? `Company #${companyId}`}
                </h3>
                <span className="text-xs text-ink-500">{members.length} contacts</span>
              </div>
              <ul className="divide-y divide-line">
                {members.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-brand">
                        {c.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{c.name}</p>
                        <p className="text-xs text-ink-500">{c.role}</p>
                        {editing === c.id ? (
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              value={draftEmail}
                              onChange={(e) => setDraftEmail(e.target.value)}
                              className="form-input h-8 max-w-xs py-1 text-xs"
                            />
                            <button onClick={() => saveEdit(c.id)} className="text-xs font-semibold text-ok">Save</button>
                            <button onClick={() => setEditing(null)} className="text-xs font-semibold text-ink-500">Cancel</button>
                          </div>
                        ) : (
                          <p className="mt-0.5 truncate text-xs text-ink-300">
                            {c.email || "—"}
                            {c.linkedin && <span className="ml-2 text-info">· {c.linkedin}</span>}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-center">
                      <Badge tone={verifTone[c.verification]}>{c.verification}</Badge>
                      <span className="mt-1 text-[11px] text-ink-300">{c.confidence}% confidence</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {c.do_not_contact && <Badge tone="danger">Do not contact</Badge>}
                      {c.approved === true ? (
                        <Badge tone="ok"><Icon.Check width={12} height={12} /> Approved</Badge>
                      ) : c.approved === false ? (
                        <Badge tone="danger">Rejected</Badge>
                      ) : null}
                      <button onClick={() => setApproved(c.id, true)} className="rounded-full bg-ok/10 p-2 text-ok hover:bg-ok/20" title="Approve">
                        <Icon.Check width={16} height={16} />
                      </button>
                      <button onClick={() => setApproved(c.id, false)} className="rounded-full bg-danger/10 p-2 text-danger hover:bg-danger/20" title="Reject">
                        <Icon.X width={16} height={16} />
                      </button>
                      <button onClick={() => { setEditing(c.id); setDraftEmail(c.email); }} className="rounded-full bg-ink/5 p-2 text-ink hover:bg-ink/10" title="Edit contact">
                        <Icon.Settings width={16} height={16} />
                      </button>
                      <button
                        onClick={() => setDnc(c.id, !c.do_not_contact)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          c.do_not_contact
                            ? "bg-danger/10 text-danger hover:bg-danger/20"
                            : "bg-ink/5 text-ink-500 hover:bg-ink/10"
                        }`}
                        title={c.do_not_contact ? "Allow contact again" : "Mark do-not-contact"}
                      >
                        {c.do_not_contact ? "Allow" : "Do not contact"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
