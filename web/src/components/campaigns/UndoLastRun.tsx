"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { SnapshotStatus } from "@/lib/api-types";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";

/** Whole hours left until the snapshot expires, for the confirm copy. */
function hoursLeft(expiresAt?: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 ? Math.max(1, Math.round(ms / 3_600_000)) : 0;
}

/**
 * Header affordance to undo the campaign's last destructive run. Renders nothing
 * unless the backend reports an available (non-expired, non-live) snapshot.
 */
export function UndoLastRun({
  campaignId,
  status,
  onRestored,
}: {
  campaignId: number;
  status: SnapshotStatus | null;
  onRestored: () => void;
}) {
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);

  if (!status?.available) return null;

  const hrs = hoursLeft(status.expires_at);

  return (
    <>
      <Button variant="secondary" busy={busy === "undo"} onClick={() => setOpen(true)}>
        ↩ Undo last run
      </Button>

      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          const ok = await run("undo", () => api.restoreCampaign(campaignId), {
            success: "Last run undone",
          });
          // Refresh availability either way: on a race (409 live / 404 expired)
          // useAction already toasted the reason, and re-checking makes the
          // button re-evaluate and disappear.
          onRestored();
          if (!ok) throw new Error("undo failed"); // keep the modal open on failure
        }}
        title="Undo the last run?"
        body={
          <>
            <p>
              This rolls the campaign back to before{" "}
              <strong className="font-semibold text-ink">
                {status.label ?? "the last run"}
              </strong>
              , bringing back the contacts, drafts and scores that run cleared.
            </p>
            <p>
              You can only undo once{hrs != null ? ` (available for ~${hrs}h)` : ""}; it
              can&rsquo;t be redone.
            </p>
          </>
        }
        confirmLabel="Undo last run"
      />
    </>
  );
}
