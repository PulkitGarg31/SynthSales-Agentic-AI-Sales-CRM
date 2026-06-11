"use client";

import { useEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { CAMPAIGN_TONE, COMPANY_TONE, VERIFICATION_TONE } from "@/lib/constants";

// ---- shared right-hand sheet -------------------------------------------------

/**
 * Right-edge drawer for the admin drill-downs. Mount-only (render it
 * conditionally); same overlay contract as Modal: Escape closes, backdrop
 * mousedown closes, body scroll locks, focus moves into the panel and back to
 * the trigger on close. Renders inline (no portal) — ancestors must never gain
 * transform/filter. Pass a STABLE `onClose` (useCallback) or the focus/scroll
 * effect re-runs on every parent render.
 */
export function Drawer({
  onClose,
  title,
  wide = false,
  children,
}: {
  onClose: () => void;
  title: string;
  /** max-w-2xl instead of max-w-xl — for dense inspector payloads. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40"
      // mousedown, not click: a text-selection drag that ends on the backdrop
      // must not close the drawer.
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-y-0 right-0 w-full overflow-y-auto border-l border-line bg-paper p-6 focus:outline-none ${
          wide ? "max-w-2xl" : "max-w-xl"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="display text-xl">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-cream hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- disclosure helpers ------------------------------------------------------

const SUMMARY =
  "flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden";

function Chevron() {
  return (
    <ChevronRight
      aria-hidden
      size={14}
      strokeWidth={1.75}
      className="shrink-0 text-ink-faint transition-transform group-open:rotate-90"
    />
  );
}

// ---- user tree ---------------------------------------------------------------

/** Nested disclosure view of one user's data: campaigns → companies → contacts. */
export function UserTreeDrawer({ userId, onClose }: { userId: number; onClose: () => void }) {
  const tree = useApi(() => api.adminUserTree(userId), [userId]);
  const t = tree.data;

  return (
    <Drawer onClose={onClose} title="User data">
      {tree.loading ? (
        <SkeletonRows n={6} />
      ) : tree.error ? (
        <ErrorCard message={tree.error} onRetry={tree.reload} />
      ) : t ? (
        <div className="space-y-5">
          <header>
            <p className="display text-2xl">{t.user?.name}</p>
            <p className="mt-0.5 font-mono text-xs text-ink-soft">{t.user?.email}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {t.user?.is_admin && <Badge tone="terracotta">Admin</Badge>}
              <Badge tone={t.user?.is_verified ? "moss" : "faint"}>
                {t.user?.is_verified ? "Verified" : "Unverified"}
              </Badge>
              <Badge tone={t.user?.outbound_enabled ? "moss" : "faint"}>
                {t.user?.outbound_enabled ? "Outbound on" : "Outbound paused"}
              </Badge>
            </div>
          </header>

          {(t.campaigns ?? []).length === 0 ? (
            <p className="font-serif italic text-ink-soft">No campaigns yet.</p>
          ) : (
            <div className="space-y-2.5">
              {(t.campaigns ?? []).map((c) => (
                <details key={c.id} className="group rounded-xl border border-line">
                  <summary className={SUMMARY}>
                    <Chevron />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name}</span>
                    <Badge tone={CAMPAIGN_TONE[c.status] ?? "faint"}>{c.status}</Badge>
                    <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                      top {c.top_n} · {(c.companies ?? []).length} companies
                    </span>
                  </summary>
                  <div className="space-y-2 border-t border-line px-3 py-3">
                    {(c.companies ?? []).length === 0 ? (
                      <p className="px-1 text-sm font-serif italic text-ink-soft">No companies.</p>
                    ) : (
                      (c.companies ?? []).map((co) => (
                        <details key={co.id} className="group/co rounded-lg border border-line bg-cream/40">
                          <summary className={SUMMARY}>
                            <ChevronRight
                              aria-hidden
                              size={14}
                              strokeWidth={1.75}
                              className="shrink-0 text-ink-faint transition-transform group-open/co:rotate-90"
                            />
                            <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-ink-faint">
                              {co.rank ? `#${co.rank}` : "—"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-ink">{co.name}</span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
                              {co.ai_score ?? 0}
                            </span>
                            <Badge tone={COMPANY_TONE[co.status] ?? "faint"}>{co.status}</Badge>
                          </summary>
                          <ul className="space-y-1.5 border-t border-line px-4 py-2.5">
                            {(co.contacts ?? []).length === 0 ? (
                              <li className="text-sm font-serif italic text-ink-soft">No contacts.</li>
                            ) : (
                              (co.contacts ?? []).map((ct) => (
                                <li key={ct.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                                  <span className="font-medium text-ink">{ct.name}</span>
                                  <span className="text-xs text-ink-soft">{ct.role}</span>
                                  {ct.email && (
                                    <span className="font-mono text-xs text-ink-soft">{ct.email}</span>
                                  )}
                                  <span className="ml-auto">
                                    <Badge tone={VERIFICATION_TONE[ct.verification] ?? "faint"}>
                                      {ct.verification}
                                    </Badge>
                                  </span>
                                </li>
                              ))
                            )}
                          </ul>
                        </details>
                      ))
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
