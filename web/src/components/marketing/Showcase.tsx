import { Eyebrow } from "@/components/ui/Eyebrow";
import { Badge } from "@/components/ui/Badge";

// Three decorative faux app windows (fake-but-plausible data) - a glance at
// the dashboard, the company pipeline, and the inbox.

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      {/* macOS traffic lights. Deliberately off-palette: these mimic real Mac
          window chrome, so they use Apple's actual vivid colors. */}
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
        <span className="size-2 rounded-full bg-[#ff5f57]" />
        <span className="size-2 rounded-full bg-[#febc2e]" />
        <span className="size-2 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-ink-faint">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm last:border-b-0">
      {children}
    </div>
  );
}

export function Showcase() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
      <div className="max-w-2xl space-y-4">
        <Eyebrow>Inside the product</Eyebrow>
        <h2 className="display text-3xl md:text-4xl">
          No Black Box, <em>just proof</em>.
        </h2>
        <p className="text-base leading-relaxed text-ink-soft">
          Every score, draft, verdict and reply is right there on screen, so you always know where
          a deal stands and why.
        </p>
      </div>
      <div aria-hidden className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Window title="Dashboard">
          <div className="grid grid-cols-3 gap-3 pb-3">
            <div>
              <p className="font-serif text-2xl leading-none">128</p>
              <p className="mt-1 text-[11px] text-ink-faint">companies</p>
            </div>
            <div>
              <p className="font-serif text-2xl leading-none">41</p>
              <p className="mt-1 text-[11px] text-ink-faint">verified</p>
            </div>
            <div>
              <p className="font-serif text-2xl leading-none">9</p>
              <p className="mt-1 text-[11px] text-ink-faint">meetings</p>
            </div>
          </div>
          <Row>
            <span className="text-ink">Research</span>
            <Badge tone="terracotta">Running</Badge>
          </Row>
          <Row>
            <span className="text-ink">Email verifier</span>
            <Badge tone="faint">Idle</Badge>
          </Row>
          <Row>
            <span className="text-ink">Outreach writer</span>
            <Badge tone="faint">Idle</Badge>
          </Row>
        </Window>
        <Window title="Pipeline">
          <Row>
            <span className="text-ink">Northwind Robotics</span>
            <Badge tone="moss">Qualified</Badge>
          </Row>
          <Row>
            <span className="text-ink">Atlas Freightworks</span>
            <Badge tone="moss">Qualified</Badge>
          </Row>
          <Row>
            <span className="text-ink">Juniper Analytics</span>
            <Badge tone="ink">Reviewed</Badge>
          </Row>
          <Row>
            <span className="text-ink">Halcyon Foods</span>
            <Badge tone="amber">Parked domain</Badge>
          </Row>
          <Row>
            <span className="text-ink">Verde Energy Co.</span>
            <Badge tone="ink">Reviewed</Badge>
          </Row>
        </Window>
        <Window title="Inbox">
          <Row>
            <div className="min-w-0">
              <p className="truncate text-ink">Sofia Marin</p>
              <p className="truncate text-xs text-ink-soft">Could you do Thursday at 10?</p>
            </div>
            <Badge tone="terracotta">Meeting-ready</Badge>
          </Row>
          <Row>
            <div className="min-w-0">
              <p className="truncate text-ink">James Whitfield</p>
              <p className="truncate text-xs text-ink-soft">Interesting, how does pricing work?</p>
            </div>
            <Badge tone="amber">Question</Badge>
          </Row>
          <Row>
            <div className="min-w-0">
              <p className="truncate text-ink">Lena Hoffman</p>
              <p className="truncate text-xs text-ink-soft">Yes, send over more detail.</p>
            </div>
            <Badge tone="moss">Interested</Badge>
          </Row>
        </Window>
      </div>
    </section>
  );
}
