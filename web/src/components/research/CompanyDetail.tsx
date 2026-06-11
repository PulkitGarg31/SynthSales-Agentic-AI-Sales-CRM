"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Globe, Minus, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import type { CompanyDetail as CompanyDetailData, Contact } from "@/lib/api-types";
import {
  COMPANY_TONE,
  DOMAIN_TONE,
  MATCH_TONE,
  VERIFICATION_TONE,
  type Tone,
} from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Field, Input } from "@/components/ui/Field";
import { SkeletonRows } from "@/components/ui/Skeleton";

// ---- helpers ---------------------------------------------------------------

const TH =
  "px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint";

const SITE_LABEL: Record<CompanyDetailData["domain_status"], string> = {
  live: "Site live",
  parked: "Site parked",
  dead: "Site unreachable",
  unknown: "Site unknown",
};

// Icon-sized counterpart of the Badge tone map (icons sit on plain paper, so
// amber gets the darker companion token for contrast, faint maps to ink-faint).
const ICON_TONE: Record<Tone, string> = {
  moss: "text-moss",
  amber: "text-amber-deep",
  rust: "text-rust",
  ink: "text-ink-soft",
  faint: "text-ink-faint",
  terracotta: "text-terracotta",
};

/** Honest per-outcome copy for the Re-research toast - keyed off the FRESH response. */
function enrichToast(r: CompanyDetailData): string {
  if (r.domain_status === "dead")
    return "Re-research complete. Site still unreachable, no new signals.";
  if (r.domain_status === "parked")
    return "Re-research complete. The site still appears parked.";
  return `Re-research complete. Confidence ${r.enrichment_confidence}/100.`;
}

// ---- local components ------------------------------------------------------

/** One boolean-ish signal row: moss check when present, faint dash when not. */
function SignalRow({
  label,
  present,
  detail,
}: {
  label: string;
  present: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      {present ? (
        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-moss" />
      ) : (
        <Minus aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{detail}</p>
      </div>
    </li>
  );
}

function ContactRow({ contact, onSaved }: { contact: Contact; onSaved: () => void }) {
  const { busy, run } = useAction();

  // Tri-state approval: clicking the active state again clears back to null
  // (undecided); clicking the other side flips it. No success toast - the row
  // repaints, and a toast per click would be noise. Errors still surface.
  const setApproval = (key: string, next: boolean | null) =>
    void run(key, () => api.updateContact(contact.id, { approved: next }), {
      onDone: onSaved,
    });

  const toggle =
    "inline-flex size-7 items-center justify-center rounded-full border transition disabled:pointer-events-none disabled:opacity-50";

  return (
    <tr>
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
    </tr>
  );
}

function AddContactForm({
  companyId,
  onSaved,
}: {
  companyId: number;
  onSaved: () => void;
}) {
  const { busy, run } = useAction();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");

  const adding = busy === "add";
  const valid = name.trim().length > 0;

  const add = () =>
    void run(
      "add",
      () =>
        api.addContact(companyId, {
          name: name.trim(),
          role: role.trim() || undefined,
          email: email.trim() || undefined,
          linkedin: linkedin.trim() || undefined,
        }),
      {
        success: "Contact added",
        onDone: () => {
          setName("");
          setRole("");
          setEmail("");
          setLinkedin("");
          onSaved();
        },
      },
    );

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
        Add contact
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Name" htmlFor="ac-name">
          <Input
            id="ac-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dana Whitfield"
          />
        </Field>
        <Field label="Role" htmlFor="ac-role">
          <Input
            id="ac-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Head of Sales"
          />
        </Field>
        <Field label="Email" htmlFor="ac-email">
          <Input
            id="ac-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dana@acme.com"
          />
        </Field>
        <Field label="LinkedIn" htmlFor="ac-linkedin">
          <Input
            id="ac-linkedin"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
            placeholder="linkedin.com/in/…"
          />
        </Field>
      </div>
      <div className="mt-3">
        <Button variant="secondary" busy={adding} disabled={!valid} onClick={add}>
          Add contact
        </Button>
      </div>
    </div>
  );
}

// Keyed by the parent on the saved mail_domain, so a successful save re-seeds
// the input with the backend-normalized value (it strips https://, www., paths).
function MailDomainField({
  companyId,
  initial,
  onSaved,
}: {
  companyId: number;
  initial: string;
  onSaved: () => void;
}) {
  const { busy, run } = useAction();
  const [value, setValue] = useState(initial);
  const saving = busy === "save";

  const save = () =>
    void run("save", () => api.setMailDomain(companyId, value.trim()), {
      success: value.trim() ? "Mail domain saved" : "Mail domain cleared",
      onDone: onSaved,
    });

  return (
    <Field
      label="Mail domain"
      htmlFor="mail-domain"
      hint="Where this company's inboxes actually live, e.g. acme-corp.com. Used by the email verifier."
    >
      <div className="flex gap-2">
        <Input
          id="mail-domain"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="acme-corp.com"
          className="max-w-xs font-mono text-xs"
        />
        <Button
          variant="secondary"
          busy={saving}
          disabled={value.trim() === initial}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </Field>
  );
}

// ---- main ------------------------------------------------------------------

export function CompanyDetail({ id }: { id: number }) {
  const router = useRouter();
  const { busy, run } = useAction();

  // A 404 resolves to `null` data (not an error): "gone" gets the friendly
  // not-found card, while real failures keep the retryable ErrorCard.
  const detail = useApi<CompanyDetailData | null>(async () => {
    try {
      return await api.company(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }, [id]);

  const c = detail.data;
  const notFound =
    !Number.isInteger(id) || (!detail.loading && !detail.error && c === null);

  if (notFound) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState
          title="Company not found"
          line="It may have been deleted, or the link is stale."
          action={<Button onClick={() => router.push("/research")}>Back to research</Button>}
        />
      </div>
    );
  }

  if (detail.loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <SkeletonRows n={6} />
      </div>
    );
  }

  if (detail.error || !c) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorCard message={detail.error ?? "Something went wrong"} onRetry={detail.reload} />
      </div>
    );
  }

  const approved = c.status === "Approved";
  const excluded = c.status === "Excluded";

  // Approve/Exclude double as their own undo: when the company is already in
  // that state, the same button reverts it to the neutral "Reviewed".
  const setStatus = (key: string, status: string, message: string) =>
    void run(key, () => api.setCompanyStatus(id, status), {
      success: message,
      onDone: detail.reload,
    });

  const meta = [c.industry, c.size, c.location].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Domain-health banner - only when research could not see a real site */}
      {c.domain_status === "parked" && (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 px-5 py-3 text-sm text-amber-deep">
          This domain serves a parked page. Verify manually before outreach.
        </div>
      )}
      {c.domain_status === "dead" && (
        <div className="rounded-2xl border border-rust/40 bg-rust/10 px-5 py-3 text-sm text-rust">
          Website unreachable. Research ran on name-based signals only.
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-3xl sm:text-4xl">{c.name}</h1>
            <Badge tone={MATCH_TONE[c.match_level]}>{c.match_level}</Badge>
            <Badge tone={COMPANY_TONE[c.status]}>{c.status}</Badge>
            <Badge tone={DOMAIN_TONE[c.domain_status]}>
              {SITE_LABEL[c.domain_status]}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            {c.domain && (
              <a
                href={`https://${c.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs text-ink-soft transition-colors hover:text-ink"
              >
                {c.domain}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </a>
            )}
            {meta && <span>{meta}</span>}
            <span className="tabular-nums">
              Score {c.ai_score} · confidence {c.enrichment_confidence}/100
            </span>
          </div>
        </div>

        {/* Actions - per-button busy; the others lock while one is in flight */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            busy={busy === "enrich"}
            disabled={busy !== null && busy !== "enrich"}
            onClick={() =>
              void run("enrich", () => api.enrichCompany(id), {
                success: enrichToast,
                onDone: detail.reload,
              })
            }
          >
            Re-research
          </Button>
          <Button
            variant="secondary"
            busy={busy === "find"}
            disabled={busy !== null && busy !== "find"}
            onClick={() =>
              void run("find", () => api.findContacts(id), {
                success: (r) =>
                  `Found ${r.contacts.length} ${r.contacts.length === 1 ? "contact" : "contacts"}`,
                onDone: detail.reload,
              })
            }
          >
            Find contacts
          </Button>
          <Button
            variant={excluded ? "secondary" : "danger"}
            busy={busy === "exclude"}
            disabled={busy !== null && busy !== "exclude"}
            onClick={() =>
              setStatus(
                "exclude",
                excluded ? "Reviewed" : "Excluded",
                excluded ? "Exclusion cleared, back to Reviewed" : "Company excluded",
              )
            }
          >
            {excluded ? "Undo exclude" : "Exclude"}
          </Button>
          <Button
            variant={approved ? "secondary" : "primary"}
            busy={busy === "approve"}
            disabled={busy !== null && busy !== "approve"}
            onClick={() =>
              setStatus(
                "approve",
                approved ? "Reviewed" : "Approved",
                approved ? "Approval cleared, back to Reviewed" : "Company approved",
              )
            }
          >
            {approved ? "Undo approve" : "Approve"}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Score breakdown">
          {c.score_factors.length === 0 ? (
            <p className="font-serif italic text-ink-soft">Not scored yet.</p>
          ) : (
            <ul className="space-y-3">
              {c.score_factors.map((f) => (
                <li key={f.label} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-sm text-ink">{f.label}</span>
                  <span className="w-14 shrink-0 font-mono text-[11px] text-ink-faint">
                    × {f.weight.toFixed(2)}
                  </span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/8">
                    <span
                      className="block h-full rounded-full bg-ink"
                      style={{ width: `${Math.min(100, Math.max(0, f.score))}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-sm tabular-nums text-ink-soft">
                    {Math.round(f.score)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Research profile">
          {c.research_points.length > 0 ? (
            <ul className="space-y-2.5">
              {c.research_points.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <span
                    aria-hidden
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-terracotta/70"
                  />
                  {p}
                </li>
              ))}
            </ul>
          ) : c.research_summary ? (
            <p className="text-sm leading-relaxed text-ink-soft">{c.research_summary}</p>
          ) : (
            <p className="font-serif italic text-ink-soft">No research yet.</p>
          )}
        </Card>

        <Card title="Signals">
          <ul className="divide-y divide-line">
            <SignalRow
              label="Funding"
              present={Boolean(c.recent_funding)}
              detail={c.recent_funding || "No recent funding found"}
            />
            <SignalRow
              label="News"
              present={Boolean(c.recent_news)}
              detail={c.recent_news || "No recent news found"}
            />
            <SignalRow
              label="Hiring"
              present={c.active_hiring}
              detail={c.active_hiring ? "Actively hiring" : "No hiring signal found"}
            />
            <li className="flex items-start gap-3 py-2">
              <Globe
                aria-hidden
                className={`mt-0.5 size-4 shrink-0 ${ICON_TONE[DOMAIN_TONE[c.domain_status]]}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Website</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {SITE_LABEL[c.domain_status]}
                </p>
              </div>
            </li>
          </ul>
        </Card>

        {c.match_explanation && (
          <Card title="Why this match">
            <blockquote className="border-l-2 border-terracotta pl-4 font-serif text-[15px] italic leading-relaxed text-ink-soft">
              {c.match_explanation}
            </blockquote>
          </Card>
        )}

        <Card title="Contacts" flush className="lg:col-span-2">
          {c.contacts.length === 0 ? (
            <p className="px-5 py-6 font-serif italic text-ink-soft">
              No contacts yet. Run Find contacts, or add one below.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className={TH}>Contact</th>
                    <th className={TH}>Email</th>
                    <th className={TH}>Verification</th>
                    <th className={`${TH} text-right`}>Confidence</th>
                    <th className={`${TH} text-right`}>Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {c.contacts.map((ct) => (
                    <ContactRow key={ct.id} contact={ct} onSaved={detail.reload} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="space-y-6 border-t border-line px-5 py-5">
            <AddContactForm companyId={id} onSaved={detail.reload} />
            <MailDomainField
              key={c.mail_domain}
              companyId={id}
              initial={c.mail_domain}
              onSaved={detail.reload}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
