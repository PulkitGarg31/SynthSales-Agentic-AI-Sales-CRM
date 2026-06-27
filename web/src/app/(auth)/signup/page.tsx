"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, enterDemo, googleStartUrl, setToken } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { DevOtpNote, OtpInput } from "@/components/auth/OtpInput";
import { PasswordHints, passwordOk } from "@/components/auth/PasswordHints";
import { useCooldown } from "@/components/auth/useCooldown";

const NETWORK_MSG = "The server is still starting. Please wait a moment and try again.";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const cooldown = useCooldown(30);
  const [google, setGoogle] = useState(false);

  // Show the Google button only when the backend says OAuth is configured.
  useEffect(() => {
    let cancelled = false;
    api
      .authProviders()
      .then((p) => {
        if (!cancelled && p.google) setGoogle(true);
      })
      .catch(() => {
        /* backend unreachable - keep the button hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.register(name, email, password);
      setDevOtp(r.dev_otp ?? null);
      setEmailSent(r.email_sent);
      setCode("");
      setStep("otp");
      cooldown.start();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_MSG);
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify(otp: string) {
    setBusy(true);
    setError(null);
    try {
      const t = await api.verifyOtp(email, otp);
      setToken(t.access_token);
      router.replace("/dashboard");
      // Stay busy through the redirect.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_MSG);
      setBusy(false);
    }
  }

  // Auto-submit when the sixth digit lands.
  function onCodeChange(v: string) {
    setCode(v);
    if (v.length === 6 && !busy) void submitVerify(v);
  }

  async function resend() {
    setBusy(true); // in-flight guard: a double-click must not burn the 3-per-10-min budget
    setError(null);
    try {
      const r = await api.resendOtp(email);
      setDevOtp(r.dev_otp ?? null);
      setEmailSent(r.email_sent);
      cooldown.start();
    } catch (err) {
      // 429 throttle details surface verbatim.
      setError(err instanceof ApiError ? err.message : NETWORK_MSG);
    } finally {
      setBusy(false);
    }
  }

  if (step === "otp") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="display text-3xl">
            Check your <em>inbox</em>
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {emailSent
              ? `We sent a code to ${email}.`
              : `Email delivery is off. Use the code below to verify ${email}.`}
          </p>
        </div>
        {devOtp && <DevOtpNote code={devOtp} onFill={() => onCodeChange(devOtp)} />}
        <OtpInput value={code} onChange={onCodeChange} disabled={busy} />
        {error && (
          <p className="text-sm text-rust" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button busy={busy} disabled={code.length !== 6} onClick={() => submitVerify(code)}>
            Verify
          </Button>
          <Button variant="ghost" disabled={cooldown.active || busy} onClick={resend}>
            {cooldown.active ? `Resend in ${cooldown.remaining}s` : "Resend code"}
          </Button>
        </div>
        <p className="text-sm text-ink-soft">
          Already verified?{" "}
          <Link href="/login" className="font-medium text-ink underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-3xl">
          Create your <em>account</em>
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Eight agents, one quiet pipeline. You approve every send.
        </p>
      </div>

      <form onSubmit={submitForm} className="space-y-4">
        <Field label="Name" htmlFor="signup-name">
          <Input
            id="signup-name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="signup-email">
          <Input
            id="signup-email"
            type="email"
            suppressHydrationWarning
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="signup-password">
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <PasswordHints password={password} />

        {error && (
          <p className="text-sm text-rust" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" busy={busy} disabled={!passwordOk(password)} className="w-full">
          Create account
        </Button>
      </form>

      {google && (
        <>
          <div className="flex items-center gap-3" aria-hidden>
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs text-ink-faint">or</span>
            <div className="h-px flex-1 bg-line" />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              window.location.href = googleStartUrl();
            }}
          >
            Continue with Google
          </Button>
        </>
      )}

      <div className="flex items-center gap-3" aria-hidden>
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-faint">or</span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => {
          enterDemo();
          router.replace("/dashboard");
        }}
      >
        View live demo
      </Button>
      <p className="text-center text-xs text-ink-faint">
        A read-only tour with sample data &mdash; nothing sends.
      </p>

      <p className="text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
