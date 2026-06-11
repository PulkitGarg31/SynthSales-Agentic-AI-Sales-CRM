"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";

const NETWORK_MSG = "Could not reach the server. Please try again in a moment.";

/**
 * Public contact form. The marketing layout has no ToastProvider, so success
 * and errors render inline (the auth-pages pattern).
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-moss/40 bg-moss/10 px-5 py-4">
        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-moss" strokeWidth={2} />
        <div>
          <p className="text-sm font-medium text-ink">Message sent.</p>
          <p className="mt-1 font-serif text-sm italic text-ink-soft">
            We read everything, and a person will reply.
          </p>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.contactUs({ name, email, message });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_MSG);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="contact-name">
          <Input
            id="contact-name"
            autoComplete="name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="contact-email">
          <Input
            id="contact-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Message"
        htmlFor="contact-message"
        hint="What you're working on, what's unclear, or what broke. At least a sentence or two."
      >
        <Textarea
          id="contact-message"
          rows={6}
          required
          minLength={10}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      {error && (
        <p className="text-sm text-rust" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" busy={busy}>
        Send message
      </Button>
    </form>
  );
}
