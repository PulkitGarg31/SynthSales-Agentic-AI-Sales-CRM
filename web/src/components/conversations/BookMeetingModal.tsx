"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

/**
 * Book a meeting on a thread. With a connected Google Calendar the backend
 * creates a real event with a Meet link; without one the user must paste a
 * link - the backend 422s otherwise, and that detail renders inline on the
 * link field (the DraftEditor inline-error pattern).
 */
export function BookMeetingModal({
  open,
  onClose,
  threadId,
  onBooked,
}: {
  open: boolean;
  onClose: () => void;
  threadId: number;
  /** Booking succeeded - refetch the thread (stage flips to Meeting). */
  onBooked: () => void;
}) {
  const { toast } = useToast();

  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("30");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [whenError, setWhenError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Stale fields must not leak into the next open. Adjust-during-render (the
  // React-docs pattern, same as ConfirmModal): no extra commit, lint-clean.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setWhen("");
      setDuration("30");
      setNotes("");
      setLink("");
      setWhenError(null);
      setLinkError(null);
    }
  }

  const submit = async () => {
    setWhenError(null);
    setLinkError(null);
    if (!when) {
      setWhenError("Pick a date and time.");
      return;
    }
    const at = new Date(when); // datetime-local is wall-clock; toISOString converts to UTC
    if (Number.isNaN(at.getTime())) {
      setWhenError("Pick a valid date and time.");
      return;
    }
    if (at.getTime() <= Date.now()) {
      setWhenError("Pick a time in the future.");
      return;
    }
    setBusy(true);
    try {
      await api.bookMeeting(threadId, {
        scheduled_at: at.toISOString(),
        duration_minutes: Math.max(5, Number(duration) || 30),
        notes: notes.trim() || undefined,
        link: link.trim() || undefined,
      });
      toast("Meeting booked", "success");
      onBooked();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setLinkError(e.message);
      } else {
        toast(e instanceof ApiError ? e.message : "Something went wrong. Try again.", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Book a meeting"
    >
      <div className="space-y-4">
        <Field label="When" htmlFor="meet-when" error={whenError}>
          <Input
            id="meet-when"
            type="datetime-local"
            value={when}
            aria-invalid={whenError ? true : undefined}
            onChange={(e) => {
              setWhen(e.target.value);
              setWhenError(null);
            }}
          />
        </Field>
        <Field label="Duration (minutes)" htmlFor="meet-duration">
          <Input
            id="meet-duration"
            type="number"
            min={5}
            step={5}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
        <Field label="Notes" htmlFor="meet-notes">
          <Textarea
            id="meet-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Agenda, context for the invite…"
          />
        </Field>
        <Field
          label="Meeting link"
          htmlFor="meet-link"
          hint="Connected Google Calendar creates a Meet link automatically. No calendar? Paste any meeting link."
          error={linkError}
        >
          <Input
            id="meet-link"
            type="url"
            value={link}
            aria-invalid={linkError ? true : undefined}
            placeholder="https://…"
            onChange={(e) => {
              setLink(e.target.value);
              setLinkError(null);
            }}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" busy={busy} onClick={() => void submit()}>
            Book meeting
          </Button>
        </div>
      </div>
    </Modal>
  );
}
