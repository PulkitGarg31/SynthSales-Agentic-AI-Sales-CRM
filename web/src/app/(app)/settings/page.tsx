"use client";

import { useState } from "react";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TONES } from "@/lib/constants";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

const tabs = ["Profile", "Email", "AI", "Security"] as const;
type Tab = (typeof tabs)[number];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("Profile");
  const [tone, setTone] = useState("consultative");
  const [followup, setFollowup] = useState(2);
  const [personalization, setPersonalization] = useState(3);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Manage your profile, email, AI, and security." />

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        {/* Tabs */}
        <nav className="flex gap-2 md:flex-col">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-left text-sm font-semibold transition-colors ${
                tab === t
                  ? "bg-ink text-white"
                  : "text-ink-500 hover:bg-ink/5"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="space-y-5">
          {tab === "Profile" && (
            <Card>
              <CardHeader title="Profile settings" />
              <div className="space-y-4 p-5">
                <Row label="Full name">
                  <input className="form-input" defaultValue="Jordan Pierce" />
                </Row>
                <Row label="Email">
                  <input className="form-input" defaultValue="jordan@apexcloud.com" />
                </Row>
                <Row label="Change password">
                  <input className="form-input" type="password" placeholder="New password" />
                </Row>
                <Button>Save changes</Button>
              </div>
            </Card>
          )}

          {tab === "Email" && (
            <>
            <OutboundControl />
            <CalendarControl />
            <Card>
              <CardHeader title="Email settings" />
              <div className="space-y-4 p-5">
                <Row label="Sender email">
                  <input className="form-input" defaultValue="jordan@apexcloud.com" />
                </Row>
                <Row label="Default signature">
                  <textarea
                    rows={3}
                    className="form-input"
                    defaultValue={"Jordan Pierce\nAccount Executive, Apex Cloud\njordan@apexcloud.com"}
                  />
                </Row>
                <Row label="Sending method (SMTP / API)">
                  <select className="form-input">
                    <option>Gmail API (connected)</option>
                    <option>Custom SMTP</option>
                    <option>Outlook / Microsoft 365</option>
                  </select>
                </Row>
                <Button>Save changes</Button>
              </div>
            </Card>
            </>
          )}

          {tab === "AI" && (
            <Card>
              <CardHeader title="AI settings" />
              <div className="space-y-5 p-5">
                <Row label="Default tone">
                  <div className="flex flex-wrap gap-2">
                    {TONES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setTone(t.value)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                          tone === t.value
                            ? "bg-ink text-white"
                            : "bg-ink/5 text-ink-500 hover:bg-ink/10"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label={`Follow-up timing: every ${[1, 2, 3, 5][followup - 1]} day(s)`}>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    value={followup}
                    onChange={(e) => setFollowup(Number(e.target.value))}
                    className="w-full accent-[var(--color-brand-600)]"
                  />
                </Row>
                <Row label={`Personalization level: ${["Low", "Balanced", "High"][personalization - 1]}`}>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    value={personalization}
                    onChange={(e) => setPersonalization(Number(e.target.value))}
                    className="w-full accent-[var(--color-brand-600)]"
                  />
                </Row>
                <Button>Save changes</Button>
              </div>
            </Card>
          )}

          {tab === "Security" && (
            <Card>
              <CardHeader title="Security settings" />
              <div className="divide-y divide-line">
                <Toggle label="Two-factor authentication (OTP)" desc="Require an email OTP at sign-in." on />
                <Toggle label="Session control" desc="Sign out of all other devices." />
                <div className="p-5">
                  <p className="mb-2 text-sm font-semibold text-ink">Login history</p>
                  <ul className="space-y-2 text-sm text-ink-500">
                    <li className="flex items-center gap-2">
                      <Icon.Check width={14} height={14} className="text-ok" /> Chrome · Windows · 2026-05-27 09:02 · This device
                    </li>
                    <li>Safari · macOS · 2026-05-25 14:40</li>
                    <li>Mobile · iOS · 2026-05-22 08:10</li>
                  </ul>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function OutboundControl() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const on = !!user?.outbound_enabled;

  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      await api.setOutbound(!on);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Outbound email sending" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              {on ? "Sending is ON" : "Sending is paused"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              While paused, the platform researches, drafts, and queues emails but
              sends nothing — &ldquo;Approve &amp; send&rdquo;, automatic follow-ups, and
              meeting confirmations are all held. Turn this on only when you&apos;re
              ready for real emails to reach prospects. (Sign-in OTP and test-to-self
              emails are unaffected.)
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={busy}
            aria-pressed={on}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              on ? "bg-ok" : "bg-ink/20"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                on ? "left-[1.45rem]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        {!on && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
            <Icon.Info width={16} height={16} /> No emails will be sent to prospects until you enable this.
          </div>
        )}
        {err && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>
        )}
      </div>
    </Card>
  );
}

function CalendarControl() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const connected = !!user?.calendar_connected;

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      const { url } = await api.connectCalendar();
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start Google Calendar connect");
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setErr(null);
    try {
      await api.disconnectCalendar();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Google Calendar" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              {connected ? "Calendar connected" : "Calendar not connected"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Connect your Google Calendar so booking a meeting creates a real Google
              Meet link on your own calendar. Without it, you can still book by pasting
              a meeting link.
            </p>
          </div>
          {connected ? (
            <Button variant="ghost" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={connect} disabled={busy}>
              <Icon.Calendar width={16} height={16} /> Connect
            </Button>
          )}
        </div>
        {err && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>
        )}
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, desc, on }: { label: string; desc: string; on?: boolean }) {
  const [v, setV] = useState(!!on);
  return (
    <div className="flex items-center justify-between gap-4 p-5">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-500">{desc}</p>
      </div>
      <button
        onClick={() => setV((x) => !x)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          v ? "bg-ok" : "bg-ink/20"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            v ? "left-[1.45rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
