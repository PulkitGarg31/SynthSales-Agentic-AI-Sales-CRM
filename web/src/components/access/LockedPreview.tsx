"use client";

import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

/**
 * Blurred placeholder panel + Request-access CTA, shown beneath the readable
 * preview for non-approved users. Reuses the request-access flow (pending state
 * after a request).
 */
export function LockedPreview({ label }: { label: string }) {
  const { me, refresh } = useAuth();
  const { busy, run } = useAction();
  const pending = me.access_status === "pending";

  const request = () =>
    void run(
      "request-access",
      async () => {
        await api.requestAccess();
        await refresh();
        return true;
      },
      { success: "Access requested — an admin will review it." },
    );

  return (
    <div className="relative min-h-[60vh] overflow-hidden rounded-2xl border border-line">
      <div aria-hidden className="pointer-events-none select-none space-y-4 p-5 blur-[6px]">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-3 w-8 rounded bg-ink/10" />
            <div className="h-3 flex-1 rounded bg-ink/10" />
            <div className="h-3 w-16 rounded bg-ink/10" />
            <div className="h-3 w-20 rounded bg-ink/10" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-cream/50 px-4 text-center">
        <p className="font-serif italic text-ink-soft">{label}</p>
        {pending ? (
          <Badge tone="amber">Access pending review</Badge>
        ) : (
          <Button busy={busy === "request-access"} onClick={request}>
            Request access
          </Button>
        )}
      </div>
    </div>
  );
}
