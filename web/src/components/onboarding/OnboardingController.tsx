"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isDemo } from "@/lib/api";
import {
  ONBOARDING_STEPS,
  markOnboardingSeen,
  onboardingSeen,
} from "@/lib/onboarding";
import { useAuth } from "@/components/AuthProvider";
import { OnboardingTour } from "./OnboardingTour";

/**
 * Decides when the first-run tour runs. It auto-starts once per account, on the
 * dashboard (where the tour's anchors exist), and never in the read-only demo.
 * "Replay tutorial" in Settings clears the flag and routes back to /dashboard,
 * which re-triggers this the same way. Mounted inside AppLayout so it can drive
 * the mobile nav sheet for sidebar steps.
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
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!me?.id || isDemo()) return;
    if (pathname !== "/dashboard") return;
    if (onboardingSeen(me.id)) return;
    setRun(true);
  }, [me?.id, pathname]);

  if (!run || !me?.id) return null;

  return (
    <OnboardingTour
      steps={ONBOARDING_STEPS}
      onOpenNav={onOpenNav}
      onCloseNav={onCloseNav}
      onFinish={() => {
        markOnboardingSeen(me.id);
        setRun(false);
      }}
    />
  );
}
