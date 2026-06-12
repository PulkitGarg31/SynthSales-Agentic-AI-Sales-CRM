import { Hero } from "@/components/marketing/Hero";
import { StatBand } from "@/components/marketing/StatBand";
import { Showcase } from "@/components/marketing/Showcase";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Features } from "@/components/marketing/Features";
import { Testimonials } from "@/components/marketing/Testimonials";
import { Faq } from "@/components/marketing/Faq";
import { CtaBand } from "@/components/marketing/CtaBand";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <StatBand />
      <Showcase />
      <HowItWorks />
      <Features />
      <Testimonials />
      <Faq />
      <CtaBand />
    </>
  );
}
