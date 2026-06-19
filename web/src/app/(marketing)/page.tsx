import { Hero } from "@/components/marketing/Hero";
import { StatBand } from "@/components/marketing/StatBand";
import { Showcase } from "@/components/marketing/Showcase";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Features } from "@/components/marketing/Features";
import { Testimonials } from "@/components/marketing/Testimonials";
import { Faq } from "@/components/marketing/Faq";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Reveal } from "@/components/marketing/Reveal";

export default function LandingPage() {
  return (
    <>
      {/* Hero is above the fold - shown immediately, no scroll reveal. */}
      <Hero />
      <Reveal>
        <StatBand />
      </Reveal>
      <Reveal>
        <Showcase />
      </Reveal>
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <Testimonials />
      </Reveal>
      <Reveal>
        <Faq />
      </Reveal>
      <Reveal>
        <CtaBand />
      </Reveal>
    </>
  );
}
