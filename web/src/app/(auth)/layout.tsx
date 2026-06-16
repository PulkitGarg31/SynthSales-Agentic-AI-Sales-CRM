import Image from "next/image";
import Link from "next/link";

/**
 * Split-screen auth shell: left = cream panel with the emblem, the form, and a
 * footer link home; right (desktop only) = solid band panel with the editorial
 * quote. No AuthProvider here - these pages are for the signed-out.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
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
            &larr; Synth<em className="font-serif italic">Sales</em><span className="text-terracotta">.</span>
          </Link>
        </p>
      </div>
      <div className="hidden lg:flex flex-col justify-end bg-band p-14">
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
