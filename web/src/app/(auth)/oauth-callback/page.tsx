"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "@/lib/api";
import { Loading } from "@/components/ui";

// Friendly copy for the error codes the backend redirects with.
const ERROR_COPY: Record<string, string> = {
  denied: "You cancelled Google sign-in.",
  state: "Your sign-in session expired or didn't match. Please try again.",
  missing_code: "Google didn't return an authorization code. Please try again.",
  exchange: "We couldn't complete sign-in with Google. Please try again.",
  userinfo: "We couldn't read your Google profile. Please try again.",
  unverified_google:
    "Your Google email isn't verified, so we can't sign you in with it.",
  email_exists:
    "An account with this email already exists — sign in with your password.",
};

function OAuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    const err = params.get("error");
    if (token) {
      setToken(token);
      router.replace("/dashboard"); // replace → strips ?token from history
    } else {
      setError(err ?? "unknown");
    }
  }, [params, router]);

  if (error) {
    return (
      <div>
        <h1 className="font-display text-3xl text-ink">Sign-in failed</h1>
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {ERROR_COPY[error] ?? "Google sign-in failed. Please try again."}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-semibold text-ink hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return <Loading label="Finishing Google sign-in…" />;
}

export default function OAuthCallbackPage() {
  // useSearchParams requires a Suspense boundary or the production build fails
  // (Next.js 16: "Missing Suspense boundary with useSearchParams").
  return (
    <Suspense fallback={<Loading label="Finishing Google sign-in…" />}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
