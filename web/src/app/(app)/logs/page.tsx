"use client";

import { useState } from "react";
import { Badge, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { LogEntry } from "@/lib/api-types";

const levelTone: Record<LogEntry["level"], "neutral" | "warn" | "danger"> = {
  info: "neutral",
  warn: "warn",
  error: "danger",
};

const categories = ["All", "Campaign", "Email", "AI", "Verification", "User"] as const;

function time(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function LogsPage() {
  const [cat, setCat] = useState<(typeof categories)[number]>("All");
  const { data, loading, error, reload } = useApi(() => api.logs(cat), [cat]);

  return (
    <div>
      <PageHeader
        title="Activity Logs & Audit Trail"
        subtitle="Transparency and debugging — every campaign, email, AI, and user action."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
              cat === c ? "bg-ink text-white" : "bg-surface text-ink-500 ring-1 ring-inset ring-line hover:bg-ink/5"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading label="Loading logs…" />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            {(data ?? []).length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-ink-500">No log entries.</div>
            ) : (
              <ul className="divide-y divide-line font-mono text-sm">
                {(data ?? []).map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-0.5 w-36 shrink-0 text-xs text-ink-300">{time(l.created_at)}</span>
                    <Badge tone={levelTone[l.level]}>{l.category}</Badge>
                    <span className={`flex-1 ${l.level === "error" ? "text-danger" : l.level === "warn" ? "text-warn" : "text-ink-700"}`}>
                      {l.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-300">
            <Icon.Logs width={13} height={13} /> Showing {(data ?? []).length} events.
          </p>
        </>
      )}
    </div>
  );
}
