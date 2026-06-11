"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, googleStartUrl, setToken } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { DevOtpNote, OtpInput } from "@/components/auth/OtpInput";
import { useCooldown } from "@/components/auth/useCooldown";

const NETWORK_MSG = "Could not reach the server. Is the backend running?";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"login" | "verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The backend's 403 detail for an unverified account - shown in an amber note.
  const [unverified, setUnverified] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const cooldown = useCooldown(30);

  // Show the Google button only when the backend says OAuth is configured.
  useEffect(() => {
    let cancelled = false;
    api
      .authProviders()
      .then((p) => {
        if (!cancelled && p.google) setGoogle(true);
      })
      .catch(() => {
        /* backend unreachable - just keep the button hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(null);
    try {
      const t = await api.login(email, password);
      setToken(t.access_token);
      router.replace("/dashboard");
      // Stay busy through the redirect - no setBusy(false) on success.
    } catch (err) {
      if (err instanceof ApiError) {
        // 403 = account exists but isn't verified (status-keyed, detail displayed).
        if (err.status === 403) setUnverified(err.message);
        else setError(err.message);
      } else {
        setError(NETWORK_MSG);
      }
      setBusy(false);
    }
  }

  // "Verify now": request a fresh code, then flip the page to the OTP step.
  // Even when the resend is throttled (429) we STILL flip to the OTP step -
  // a recently-registered user may have a valid code in their inbox already,
  // and stranding them on the password step would lock verification needlessly.
  async function startVerify() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.resendOtp(email);
      setDevOtp(r.dev_otp ?? null);
      setSentNote(r.email_sent ? `We sent a code to ${email}.` : `A new code was generated for ${email}.`);
      cooldown.start();
    } catch (err) {
      setSentNote(`Enter the code we previously sent to ${email}.`);
      setError(err instanceof ApiError ? err.message : NETWORK_MSG);
    } finally {
      setCode("");
      setStep("verify");
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : NETWORK_MSG);
      setBusy(false);
    }
  }

  // Auto-submit the moment the sixth digit lands.
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
      setSentNote(r.email_sent ? `We sent a new code to ${email}.` : `A new code was generated for ${email}.`);
      cooldown.start();
    } catch (err) {
      // 429 throttle details surface verbatim.
      setError(err instanceof ApiError ? err.message : NETWORK_MSG);
    } finally {
      setBusy(false);
    }
  }

  if (step === "verify") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="display text-3xl">
            Verify your <em>email</em>
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {sentNote ?? `Enter the 6-digit code for ${email}.`}
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
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setError(null); // a stale "Invalid code" must not read as a password error
            setStep("login");
          }}
        >
          &larr; Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-3xl">
          Sign <em>in</em>
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your agents kept working while you were away.
        </p>
      </div>

      <form onSubmit={submitLogin} className="space-y-4">
        <Field label="Email" htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && (
          <p className="text-sm text-rust" role="alert">
            {error}
          </p>
        )}
        {unverified && (
          <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
            <p className="text-sm text-ink">{unverified}</p>
            <Button type="button" variant="secondary" className="mt-3" busy={busy} onClick={startVerify}>
              Verify now
            </Button>
          </div>
        )}

        <Button type="submit" busy={busy} className="w-full">
          Sign in
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

      <p className="text-sm text-ink-soft">
        No account?{" "}
        <Link href="/signup" className="font-medium text-ink underline underline-offset-2">
          Create one
        </Link>{" "}
        &middot;{" "}
        <Link href="/forgot-password" className="font-medium text-ink underline underline-offset-2">
          Forgot password?
        </Link>
      </p>
    </div>
  );
}
