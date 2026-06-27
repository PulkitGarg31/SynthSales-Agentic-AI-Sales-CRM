"use client";

import { BackendWarmup } from "@/components/BackendWarmup";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sliding split-screen auth shell. On desktop the form and the editorial
 * quote panel each occupy half the screen and swap sides with a smooth
 * transform transition: Sign in keeps the form on the RIGHT; opening Create
 * account slides it to the LEFT (and the quote panel the other way). On mobile
 * it collapses to the single full-width form (quote panel hidden), so the
 * navigation is a plain page swap with nothing to slide.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSignup = pathname?.startsWith("/signup") ?? false;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <BackendWarmup />
      {/* Form panel: right half on sign-in, left half on sign-up. */}
      <div
        className={`flex min-h-screen flex-col px-6 py-8 sm:px-12 lg:absolute lg:inset-y-0 lg:left-0 lg:w-1/2 lg:px-12 lg:transition-transform lg:duration-500 lg:ease-in-out ${
          isSignup ? "lg:translate-x-0" : "lg:translate-x-full"
        }`}
      >
        <Link href="/" aria-label="SynthSales home" className="w-fit">
          <Image
            src="/brand/emblem.png"
            alt="SynthSales"
            width={742}
            height={894}
            sizes="56px"
            priority
            className="h-14 w-auto"
          />
        </Link>
        <div className="flex flex-1 items-center py-12">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </div>
        <p className="text-sm text-ink-soft">
          <Link href="/" className="transition hover:text-ink">
            &larr; Synth<em className="font-serif italic">Sales</em>
            <span className="text-terracotta">.</span>
          </Link>
        </p>
      </div>

      {/* Quote panel: opposite half, slides the other way. Desktop only. */}
      <div
        className={`hidden bg-band p-14 lg:absolute lg:inset-y-0 lg:left-0 lg:flex lg:w-1/2 lg:flex-col lg:justify-end lg:transition-transform lg:duration-500 lg:ease-in-out ${
          isSignup ? "lg:translate-x-full" : "lg:translate-x-0"
        }`}
      >
        <div aria-hidden className="mb-6 h-px w-16 bg-terracotta" />
        <p className="font-serif italic text-4xl leading-snug text-cream">
          &ldquo;The agents ride ahead.
          <br />
          You take the meeting.&rdquo;
        </p>
      </div>
    </div>
  );
}
