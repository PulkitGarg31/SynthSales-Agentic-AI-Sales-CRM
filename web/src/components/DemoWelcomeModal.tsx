"use client";

import { useEffect, useState } from "react";
import { isDemo } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { demoWelcomed, markDemoWelcomed } from "@/lib/demo";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Centered warning shown once per session when a visitor enters the read-only
 * demo account. "OK" dismisses for the session; "Create account" leaves the demo
 * and routes to signup. Mounted inside AuthProvider so it overlays every page.
 */
export function DemoWelcomeModal() {
  // signOut() in demo mode clears the demo and routes to /signup.
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // One-time mount read of client-only storage (unavailable during SSR); the
    // open state is intentionally derived here rather than during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isDemo() && !demoWelcomed()) setOpen(true);
  }, []);

  if (!open) return null;

  const dismiss = () => {
    markDemoWelcomed();
    setOpen(false);
  };
  const createAccount = signOut;

  return (
    <Modal open onClose={dismiss} title="You're viewing the demo">
      <p className="text-sm text-ink-soft">
        This is a static demo account for display purposes only. It&rsquo;s pre-filled
        with sample data so you can see how SynthSales looks from the inside &mdash;
        but <strong className="font-semibold text-ink">nothing here works</strong>.
        Create a real account for real results.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={dismiss}>
          OK
        </Button>
        <Button variant="accent" onClick={createAccount}>
          Create account
        </Button>
      </div>
    </Modal>
  );
}
