import type { Tone } from "@/lib/constants";

const tones: Record<Tone, string> = {
  moss: "bg-moss/10 text-moss",
  amber: "bg-amber/10 text-amber",
  rust: "bg-rust/10 text-rust",
  ink: "bg-ink/8 text-ink-soft",
  faint: "bg-ink/5 text-ink-faint",
  terracotta: "bg-terracotta/10 text-terracotta",
};

export function Badge({ tone = "faint", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
