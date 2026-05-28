"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/30 text-ink">
          <Icon.Mail width={26} height={26} />
        </div>
        <h1 className="font-display text-3xl text-ink">Check your inbox</h1>
        <p className="mt-2 text-sm text-ink-500">
          If an account exists for{" "}
          <span className="font-semibold text-ink">{email}</span>, we&apos;ve sent
          a link to reset your password.
        </p>
        <Button href="/login" variant="ghost" className="mt-6">
          ← Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Reset password</h1>
      <p className="mt-1 text-sm text-ink-500">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
        className="mt-6 space-y-4"
      >
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">
            Email
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
        <Button type="submit" className="w-full">
          Send reset link <Icon.Arrow width={16} height={16} />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-ink hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
