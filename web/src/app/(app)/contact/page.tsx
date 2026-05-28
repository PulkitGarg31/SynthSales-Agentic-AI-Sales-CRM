"use client";

import { useState } from "react";
import { Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

const faqs = [
  ["How does email verification work?", "Reachly generates likely addresses from name + domain patterns and verifies them via Verifalia. Sending only ever uses verified addresses."],
  ["Can I review messages before they send?", "Yes. Contacts and AI-generated drafts both have a human approval step before any outreach goes out."],
  ["How often are follow-ups sent?", "The tracking agent checks the inbox every 15 minutes and sends contextual follow-ups until a meeting is booked or the campaign is stopped."],
  ["Is my data secure?", "Sessions are protected, OTP is available for sign-in, and you control which integrations are connected."],
];

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Contact & Support" subtitle="We're here to help." />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Support form */}
        <Card>
          <CardHeader title="Send us a message" />
          <div className="p-5">
            {sent ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-ok">
                  <Icon.Check width={24} height={24} />
                </div>
                <p className="font-bold text-ink">Message sent</p>
                <p className="mt-1 text-sm text-ink-500">
                  Our team will get back to you within one business day.
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink">Subject</label>
                  <input className="form-input" required placeholder="How can we help?" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-ink">Message</label>
                  <textarea rows={5} className="form-input" required placeholder="Describe your issue or question…" />
                </div>
                <Button type="submit" className="w-full">
                  Send message <Icon.Arrow width={16} height={16} />
                </Button>
              </form>
            )}

            <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-sm text-ink-500">
              <Icon.Mail width={16} height={16} className="text-ink-300" />
              Or email us at{" "}
              <a href="mailto:support@reachly.example" className="font-semibold text-info hover:underline">
                support@reachly.example
              </a>
            </div>
          </div>
        </Card>

        {/* FAQ */}
        <Card className="h-fit">
          <CardHeader title="FAQ" />
          <ul className="divide-y divide-line">
            {faqs.map(([q, a], i) => (
              <li key={q}>
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
                >
                  <span className="text-sm font-semibold text-ink">{q}</span>
                  <span className="text-ink-300">{open === i ? "–" : "+"}</span>
                </button>
                {open === i && (
                  <p className="px-5 pb-4 text-sm text-ink-500">{a}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
