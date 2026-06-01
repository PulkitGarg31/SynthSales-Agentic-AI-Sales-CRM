"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, setToken, googleStartUrl } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("jordan@apexcloud.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);

  useEffect(() => {
    api
      .authProviders()
      .then((p) => setGoogleOn(p.google))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const tok = await api.login(email, password);
      setToken(tok.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-500">
        Sign in to your Reachly workspace.
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
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-ink-300">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            suppressHydrationWarning
            className="auth-input"
            placeholder="you@company.com"
          />
        </Field>
        <Field
          label="Password"
          aside={
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-info hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="auth-input"
            placeholder="••••••••"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-500">
          <input type="checkbox" className="rounded border-line text-brand-600 focus:ring-brand/40" />
          Keep me signed in
        </label>

        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"} <Icon.Arrow width={16} height={16} />
        </Button>
      </form>

      <p className="mt-4 rounded-lg bg-peach-soft/70 px-3 py-2 text-center text-xs text-ink-500">
        Demo: <span className="font-semibold text-ink">jordan@apexcloud.com</span> /{" "}
        <span className="font-semibold text-ink">password123</span>
      </p>

      <p className="mt-6 text-center text-sm text-ink-500">
        New to Reachly?{" "}
        <Link href="/signup" className="font-semibold text-ink hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-semibold text-ink">{label}</label>
        {aside}
      </div>
      {children}
    </div>
  );
}
