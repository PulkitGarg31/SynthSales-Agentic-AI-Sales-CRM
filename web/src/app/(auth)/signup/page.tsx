"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, setToken, googleStartUrl } from "@/lib/api";

type Step = "details" | "otp";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    api
      .authProviders()
      .then((p) => setGoogleOn(p.google))
      .catch(() => {});
  }, []);

  function applyDevOtp(code?: string | null) {
    if (code && /^\d{6}$/.test(code)) {
      setDevOtp(code);
      setOtp(code.split(""));
    }
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.register(name, email, password);
      setEmailSent(res.email_sent);
      applyDevOtp(res.dev_otp);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  function handleOtp(i: number, v: string) {
    // Support pasting the whole 6-digit code into any box.
    if (v.length > 1) {
      const digits = v.replace(/\D/g, "").slice(0, 6).split("");
      if (digits.length) {
        const next = ["", "", "", "", "", ""];
        digits.forEach((d, idx) => (next[idx] = d));
        setOtp(next);
        inputs.current[Math.min(digits.length, 5)]?.focus();
      }
      return;
    }
    if (!/^\d?$/.test(v)) return;
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    if (v && i < 5) inputs.current[i + 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    digits.split("").forEach((d, idx) => (next[idx] = d));
    setOtp(next);
    inputs.current[Math.min(digits.length, 5)]?.focus();
  }

  function handleOtpKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      // Empty box: jump to the previous box and clear it.
      e.preventDefault();
      const next = [...otp];
      next[i - 1] = "";
      setOtp(next);
      inputs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      inputs.current[i + 1]?.focus();
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const tok = await api.verifyOtp(email, otp.join(""));
      setToken(tok.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const res = await api.resendOtp(email);
      setEmailSent(res.email_sent);
      applyDevOtp(res.dev_otp);
    } catch {
      /* ignore */
    }
  }

  if (step === "otp") {
    return (
      <div>
        <button
          onClick={() => setStep("details")}
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink"
        >
          ← Back
        </button>
        <h1 className="font-display text-3xl text-ink">Verify your email</h1>
        <p className="mt-1 text-sm text-ink-500">
          {emailSent ? (
            <>
              We emailed a 6-digit code to{" "}
              <span className="font-semibold text-ink">{email || "your inbox"}</span>.
              Check your inbox (and spam).
            </>
          ) : (
            <>Enter the 6-digit code for{" "}
              <span className="font-semibold text-ink">{email || "your account"}</span>.</>
          )}
        </p>

        {devOtp && (
          <div className="mt-4 rounded-lg bg-brand/15 px-3 py-2.5 text-sm text-ink">
            <span className="font-semibold">Dev mode:</span> email isn&apos;t configured,
            so your code is{" "}
            <span className="font-mono font-bold tracking-widest">{devOtp}</span>{" "}
            (pre-filled below).
          </div>
        )}

        <form onSubmit={verify} className="mt-6">
          <div className="flex justify-between gap-2">
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={d}
                onChange={(e) => handleOtp(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={handleOtpPaste}
                onFocus={(e) => e.target.select()}
                inputMode="numeric"
                maxLength={1}
                className="h-14 w-12 rounded-xl border border-line bg-surface text-center text-xl font-bold text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand/30"
              />
            ))}
          </div>
          {error && (
            <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="mt-6 w-full" disabled={busy}>
            {busy ? "Verifying…" : "Verify & continue"}{" "}
            <Icon.Check width={16} height={16} />
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500">
          Didn&apos;t get the code?{" "}
          <button onClick={resend} className="font-semibold text-ink hover:underline">
            Resend
          </button>
          <span className="mt-1 block text-xs text-ink-300">
            (dev: the code is printed in the backend console)
          </span>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-ink-500">
        Start filling your pipeline in minutes.
      </p>

      {googleOn && (
        <>
          <button
            type="button"
            onClick={() => {
              window.location.href = googleStartUrl();
            }}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-line bg-surface py-2.5 text-sm font-semibold text-ink hover:bg-ink/5"
          >
            <span className="font-display text-base text-accent">G</span>
            Sign up with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-ink-300">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submitDetails} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">
            Full name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="auth-input"
            placeholder="Jordan Pierce"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">
            Work email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            suppressHydrationWarning
            className="auth-input"
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            placeholder="Create a strong password"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-ink-500">
          <input
            type="checkbox"
            required
            className="mt-0.5 rounded border-line text-brand-600 focus:ring-brand/40"
          />
          I agree to the Terms of Service and Privacy Policy.
        </label>

        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Continue"}{" "}
          <Icon.Arrow width={16} height={16} />
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
