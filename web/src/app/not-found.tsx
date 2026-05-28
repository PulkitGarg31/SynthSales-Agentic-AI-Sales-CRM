import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-peach px-6 text-center">
      <Logo />
      <h1 className="mt-8 font-display text-7xl text-ink">404</h1>
      <p className="mt-2 max-w-sm text-ink-500">
        We couldn&apos;t find that page. It may have been moved, or it never
        existed.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-full bg-brand px-5 py-2.5 font-bold text-ink hover:bg-brand-600"
        >
          Go to dashboard
        </Link>
        <Link
          href="/"
          className="rounded-full px-5 py-2.5 font-semibold text-ink ring-1 ring-inset ring-ink/20 hover:bg-ink/5"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
