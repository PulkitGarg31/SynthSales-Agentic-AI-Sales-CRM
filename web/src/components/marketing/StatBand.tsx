import { STATS } from "@/lib/copy";

// Full-bleed dark band — cream serif numerals on band ink, per the reference.
// (No desert photo asset exists; flat bg-band is the sanctioned fallback.)
export function StatBand() {
  return (
    <section className="bg-band py-16 md:py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 text-center sm:grid-cols-3">
        {STATS.map((stat) => (
          <div key={stat.label} className="space-y-2.5">
            <p className="font-serif text-5xl leading-none text-cream md:text-6xl">{stat.value}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-cream/60">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
