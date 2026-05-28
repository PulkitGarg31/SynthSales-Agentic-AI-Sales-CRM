import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/icons";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-peach p-3 sm:p-5">
      <div className="grid min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-[28px] bg-surface sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-2">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 lg:flex">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,rgba(240,130,75,0.45),transparent_55%),radial-gradient(90%_70%_at_90%_10%,rgba(255,212,0,0.22),transparent_50%)]" />
          <div className="relative z-10">
            <Link href="/">
              <Logo variant="light" />
            </Link>
          </div>
          <div className="relative z-10">
            <h2 className="font-display text-5xl text-white">
              Logistics for
              <br />
              <span className="text-brand">your pipeline</span>
            </h2>
            <p className="mt-4 max-w-sm text-white/75">
              Research, score, verify, and reach the right decision-makers —
              all on autopilot, with human review where it counts.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-3 text-sm text-white/60">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/20 text-brand">
              <Icon.Sparkle width={16} height={16} />
            </span>
            8 AI agents · 15-minute follow-up cadence · explainable scoring
          </div>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 lg:hidden">
              <Link href="/">
                <Logo />
              </Link>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
