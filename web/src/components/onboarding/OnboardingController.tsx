"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useDemo, useDemoWelcomed } from "@/lib/demo";
import {
  DEMO_TOUR_STEPS,
  ONBOARDING_STEPS,
  markOnboardingSeen,
  onboardingSeen,
} from "@/lib/onboarding";
import { useAuth } from "@/components/AuthProvider";
import { OnboardingTour } from "./OnboardingTour";

/**
 * Decides when the first-run tour runs. It auto-starts once per account, on the
 * dashboard (where the tour's anchors exist). In the read-only demo it waits for
 * the welcome popup to be dismissed, runs the demo steps (+ an "Exit demo" CTA),
 * and shows once per demo visit (enterDemo() resets the demo user's flag).
 * "Replay product tour" in Settings clears the flag and routes back to
 * /dashboard, which re-triggers this the same way. Mounted inside AppLayout so it
 * can drive the mobile nav sheet for sidebar steps.
 */
export function OnboardingController({
  onOpenNav,
  onCloseNav,
}: {
  onOpenNav: () => void;
  onCloseNav: () => void;
}) {
  const { me } = useAuth();
  const pathname = usePathname();
  const demo = useDemo();
  const welcomed = useDemoWelcomed();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!me?.id) return;
    // Demo: the welcome popup goes first; the tour starts once it's dismissed.
    if (demo && !welcomed) return;
    if (pathname !== "/dashboard") return;
    if (onboardingSeen(me.id)) return;
    // Starting the tour depends on client-only storage (the per-user seen
    // flag), so it's decided here rather than during render. `run` stays
    // latched until onFinish, even if the inputs change mid-tour.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRun(true);
  }, [me?.id, pathname, demo, welcomed]);

  if (!run || !me?.id) return null;

  return (
    <OnboardingTour
      steps={demo ? DEMO_TOUR_STEPS : ONBOARDING_STEPS}
      onOpenNav={onOpenNav}
      onCloseNav={onCloseNav}
      onFinish={() => {
        markOnboardingSeen(me.id);
        setRun(false);
      }}
    />
  );
}
