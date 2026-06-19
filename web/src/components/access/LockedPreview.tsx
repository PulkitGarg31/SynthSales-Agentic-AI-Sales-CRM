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
      {/* Blurred fake results table — reads as real results being hidden. */}
      <div aria-hidden className="pointer-events-none select-none blur-[5px]">
        <div className="flex items-center gap-4 border-b border-line px-5 py-3">
          <div className="h-2.5 w-8 rounded bg-ink/15" />
          <div className="h-2.5 w-24 rounded bg-ink/15" />
          <div className="ml-auto h-2.5 w-12 rounded bg-ink/15" />
          <div className="h-2.5 w-14 rounded bg-ink/15" />
          <div className="h-2.5 w-14 rounded bg-ink/15" />
          <div className="h-2.5 w-10 rounded bg-ink/15" />
        </div>
        {Array.from({ length: 9 }).map((_, i) => {
          const nameW = ["w-44", "w-32", "w-52", "w-36", "w-40"][i % 5];
          return (
            <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-3.5">
              <div className="h-3 w-5 rounded bg-ink/10" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className={`h-3 ${nameW} rounded bg-ink/15`} />
                <div className="h-2 w-24 rounded bg-ink/10" />
              </div>
              <div className="h-5 w-8 rounded bg-ink/15" />
              <div className="h-4 w-14 rounded-full bg-ink/10" />
              <div className="h-4 w-16 rounded-full bg-ink/10" />
              <div className="h-3 w-9 rounded bg-ink/10" />
            </div>
          );
        })}
      </div>
      {/* Centered access card floating over the blurred table. */}
      <div className="absolute inset-0 flex items-center justify-center bg-cream/30 px-4">
        <div className="max-w-sm rounded-2xl border border-line bg-paper/95 px-6 py-5 text-center shadow-lg">
          <p className="font-serif italic text-ink-soft">{label}</p>
          <div className="mt-3 flex justify-center">
            {pending ? (
              <Badge tone="amber">Access pending review</Badge>
            ) : (
              <Button busy={busy === "request-access"} onClick={request}>
                Request access
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
