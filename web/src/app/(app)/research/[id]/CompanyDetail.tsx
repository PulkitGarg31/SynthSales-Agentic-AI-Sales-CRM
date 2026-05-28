"use client";

import { useState } from "react";
import { Badge, Button, Card, CardHeader, Progress } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import type { CompanyDetail as Company, VerificationStatus } from "@/lib/api-types";

type Action = "approve" | "exclude" | "research" | "contacts";

const verifTone: Record<VerificationStatus, "ok" | "warn" | "danger" | "neutral"> = {
  Verified: "ok",
  Risky: "warn",
  Invalid: "danger",
  Unknown: "neutral",
};

export function CompanyDetail({
  company,
  onChange,
}: {
  company: Company;
  onChange: () => void;
}) {
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" | "danger" } | null>(null);
  const busy = busyAction !== null;

  function flash(msg: string, tone: "ok" | "warn" | "danger" = "ok") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  }

  async function act(action: Action, fn: () => Promise<unknown>, successMsg: string) {
    setBusyAction(action);
    try {
      await fn();
      onChange();
      flash(successMsg, "ok");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Action failed";
      flash(msg, "danger");
    } finally {
      setBusyAction(null);
    }
  }

  function summarizeAfterResearch(): string {
    // The toast fires before onChange() refreshes the data, so this still
    // reflects the OLD confidence; the real "after" is what's on screen once
    // the page reloads. We just acknowledge that the action ran and tell the
    // user whether the AI was forced through despite a bad domain.
    if (company.domain_status === "dead" || company.domain_status === "parked") {
      return "Re-research complete — searched by company name despite the site issue.";
    }
    return "Re-research complete — fresh data on screen.";
  }

  return (
    <div className={busy ? "pointer-events-none opacity-70" : ""}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl text-ink">{company.name}</h1>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-bold text-brand">
              #{company.rank || "—"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {company.industry} · {company.size} employees · {company.location} ·{" "}
            <span className="text-ink-300">{company.domain}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={company.status === "Excluded" ? "danger" : "ok"}>{company.status}</Badge>
            <Badge tone="brand">Match: {company.match_level}</Badge>
            {company.domain_status === "dead" && (
              <Badge tone="danger">Site unreachable</Badge>
            )}
            {company.domain_status === "parked" && (
              <Badge tone="warn">Site parked</Badge>
            )}
            {company.active_hiring && <Badge tone="ok">Actively hiring</Badge>}
            {company.recent_funding && <Badge tone="info">{company.recent_funding}</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => act("approve", () => api.setCompanyStatus(company.id, "Approved"), "Approved")}
          >
            <Icon.Check width={16} height={16} />{" "}
            {busyAction === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => act("exclude", () => api.setCompanyStatus(company.id, "Excluded"), "Excluded from this campaign")}
          >
            <Icon.X width={16} height={16} />{" "}
            {busyAction === "exclude" ? "Excluding…" : "Exclude"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              act(
                "research",
                () => api.enrichCompany(company.id),
                summarizeAfterResearch(),
              )
            }
          >
            <Icon.Research width={16} height={16} />{" "}
            {busyAction === "research" ? "Re-researching…" : "Re-research"}
          </Button>
        </div>
      </div>

      {(company.domain_status === "dead" || company.domain_status === "parked") && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          <Icon.Info width={18} height={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">
              {company.domain_status === "dead"
                ? "Website unreachable"
                : "Website appears parked"}
            </p>
            <p className="mt-0.5 text-danger/85">
              {company.domain_status === "dead" ? (
                <>
                  <span className="font-mono">{company.domain || "(no domain on file)"}</span>{" "}
                  doesn&apos;t respond — DNS failure or server offline. No public
                  signals could be gathered. Verify manually before outreach.
                </>
              ) : (
                <>
                  <span className="font-mono">{company.domain}</span> responds, but
                  the page is a parking/placeholder — likely the company no longer
                  uses this domain, or the link in the CSV is incorrect. Verify
                  manually before outreach.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Research summary" />
            <div className="space-y-4 p-5 text-sm leading-relaxed text-ink-700">
              <p>{company.research_summary || "Not yet researched."}</p>
              {company.recent_news && (
                <div className="flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2 text-warn">
                  <Icon.Info width={16} height={16} className="mt-0.5 shrink-0" />
                  <span><strong>Recent news:</strong> {company.recent_news}</span>
                </div>
              )}
              {company.match_explanation && (
                <div className="rounded-lg bg-peach-soft/70 px-3 py-2 text-ink-700">
                  <strong className="text-ink">Why it matches:</strong> {company.match_explanation}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Scoring breakdown"
              subtitle="Weighted, explainable scoring against your requirements"
              action={
                <span className="font-display text-3xl text-ink">
                  {company.ai_score}
                  <span className="text-base text-ink-300">/100</span>
                </span>
              }
            />
            <div className="space-y-4 p-5">
              {company.score_factors.length === 0 && (
                <p className="text-sm text-ink-300">Run scoring to see the breakdown.</p>
              )}
              {company.score_factors.map((f) => (
                <div key={f.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">
                      {f.label}{" "}
                      <span className="text-xs font-normal text-ink-300">
                        (weight {Math.round(f.weight * 100)}%)
                      </span>
                    </span>
                    <span className="text-ink-500">{f.score}</span>
                  </div>
                  <Progress value={f.score} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Contacts discovered"
              subtitle={`${company.contacts_verified}/${company.contacts_found} verified`}
            />
            <div className="p-5">
              <Progress
                value={company.contacts_found === 0 ? 0 : (company.contacts_verified / company.contacts_found) * 100}
                className="mb-4"
              />
              {company.contacts.length === 0 ? (
                <div>
                  <p className="text-sm text-ink-500">No contacts discovered yet.</p>
                  <Button
                    variant="ghost"
                    className="mt-3 w-full text-sm"
                    disabled={busy}
                    onClick={() =>
                      act("contacts", () => api.findContacts(company.id), "Contacts discovered")
                    }
                  >
                    <Icon.Sparkle width={14} height={14} />{" "}
                    {busyAction === "contacts" ? "Finding contacts…" : "Find contacts"}
                  </Button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {company.contacts.map((ct) => (
                    <li key={ct.id} className="rounded-xl border border-line p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{ct.name}</span>
                        <Badge tone={verifTone[ct.verification]}>{ct.verification}</Badge>
                      </div>
                      <p className="text-xs text-ink-500">{ct.role}</p>
                      <p className="mt-1 truncate text-xs text-ink-300">{ct.email || "—"}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Button href="/contacts" variant="ghost" className="mt-4 w-full text-sm">
                Review all contacts
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Signals" />
            <ul className="divide-y divide-line text-sm">
              <DomainSignal status={company.domain_status} />
              <Signal label="Active hiring" ok={company.active_hiring} />
              <Signal label="Recent funding" ok={!!company.recent_funding} />
              <Signal label="No negative news" ok={!company.recent_news} />
            </ul>
          </Card>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-xl ${
            toast.tone === "danger"
              ? "bg-danger text-white"
              : toast.tone === "warn"
              ? "bg-warn text-ink"
              : "bg-ink text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Signal({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between px-5 py-3">
      <span className="text-ink-700">{label}</span>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full ${
          ok ? "bg-ok/15 text-ok" : "bg-ink/10 text-ink-300"
        }`}
      >
        {ok ? <Icon.Check width={14} height={14} /> : <Icon.X width={14} height={14} />}
      </span>
    </li>
  );
}

function DomainSignal({ status }: { status: Company["domain_status"] }) {
  const cfg =
    status === "live"
      ? { label: "Website live", cls: "bg-ok/15 text-ok", icon: <Icon.Check width={14} height={14} /> }
      : status === "parked"
      ? { label: "Website parked", cls: "bg-warn/15 text-warn", icon: <Icon.Info width={14} height={14} /> }
      : status === "dead"
      ? { label: "Website unreachable", cls: "bg-danger/15 text-danger", icon: <Icon.X width={14} height={14} /> }
      : { label: "Website not checked", cls: "bg-ink/10 text-ink-300", icon: <Icon.Info width={14} height={14} /> };
  return (
    <li className="flex items-center justify-between px-5 py-3">
      <span className="text-ink-700">{cfg.label}</span>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${cfg.cls}`}>
        {cfg.icon}
      </span>
    </li>
  );
}
