"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "@/lib/api";

// Friendly copy for the backend's _oauth_error_redirect reason codes.
const ERROR_COPY: Record<string, string> = {
  denied: "Google sign-in was cancelled.",
  state: "The sign-in attempt expired or didn't match. Please start again.",
  missing_code: "Google didn't return an authorization code. Please try again.",
  exchange: "We couldn't complete the handshake with Google. Please try again.",
  userinfo: "We couldn't read your Google profile. Please try again.",
  unverified_google:
    "That Google account's email isn't verified with Google, so we can't trust it. Verify it there first.",
};

const GENERIC_ERROR = "Something went wrong during Google sign-in. Please try again.";

function Splash() {
  return (
    <div className="flex justify-center py-12">
      <Image
        src="/brand/emblem.png"
        alt="SynthSales"
        width={742}
        height={894}
        sizes="64px"
        priority
        className="h-16 w-auto animate-pulse motion-reduce:animate-none"
      />
    </div>
  );
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get("error");
  // "checking" until the effect has inspected the URL fragment — starts the same
  // on server and client so there's no hydration flash.
  const [state, setState] = useState<"checking" | "done">("checking");

  useEffect(() => {
    // The backend delivers the session token in the URL *fragment* (never sent to
    // servers/logs). Read it, store it, then scrub the fragment from the URL.
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
      "token",
    );
    if (token) {
      setToken(token);
      window.history.replaceState(null, "", window.location.pathname);
      router.replace("/dashboard");
    } else {
      setState("done");
    }
  }, [router]);

  if (state === "checking") return <Splash />;

  // No token: either an explicit error code, or someone landed here directly.
  const message = error
    ? (ERROR_COPY[error] ?? GENERIC_ERROR)
    : "This page completes Google sign-in, but nothing arrived with it.";

  return (
    <div className="space-y-6">
      <h1 className="display text-3xl">
        Sign-in <em>interrupted</em>
      </h1>
      <p className="text-sm text-rust" role="alert">
        {message}
      </p>
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:opacity-90"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export default function OAuthCallbackPage() {
  // Next 16: useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense fallback={<Splash />}>
      <CallbackInner />
    </Suspense>
  );
}
