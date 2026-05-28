"use client";

import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Agent } from "@/lib/api-types";

const statusTone: Record<Agent["status"], "neutral" | "ok" | "danger"> = {
  Idle: "neutral",
  Running: "ok",
  Error: "danger",
};

export default function AgentsPage() {
  const { data, loading, error, reload } = useApi(() => api.agents(), []);
  const [list, setList] = useState<Agent[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (loading) return <Loading label="Loading agents…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const agents = (list ?? data ?? []).slice().sort((a, b) => a.order - b.order);

  async function toggle(a: Agent) {
    const updated = await api.updateAgent(a.id, !a.enabled);
    setList(agents.map((x) => (x.id === a.id ? updated : x)));
  }

  async function runTracking() {
    const res = await api.runTracking();
    setToast(`Tracking agent ran — ${res.follow_ups_sent} follow-up(s) sent`);
    setTimeout(() => setToast(null), 2600);
  }

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="The AI workflow that powers your pipeline. Agents run sequentially, top to bottom."
        actions={
          <Button variant="ghost" onClick={runTracking}>
            <Icon.Play width={15} height={15} /> Run follow-up agent
          </Button>
        }
      />

      <Card className="mb-6 overflow-x-auto p-5">
        <div className="flex min-w-max items-center gap-2">
          {agents.map((a, i) => (
            <div key={a.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${a.enabled ? "bg-ink text-white" : "bg-ink/5 text-ink-300 line-through"}`}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] text-ink">{a.order}</span>
                {a.name}
              </div>
              {i < agents.length - 1 && <Icon.Arrow width={16} height={16} className="text-ink-300" />}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/25 text-ink">
                  <Icon.Bot width={18} height={18} />
                </span>
                <div>
                  <p className="font-bold text-ink">{a.order}. {a.name}</p>
                  <Badge tone={statusTone[a.status]}>{a.status}</Badge>
                </div>
              </div>
              <button
                onClick={() => toggle(a)}
                className={`relative h-6 w-11 rounded-full transition-colors ${a.enabled ? "bg-ok" : "bg-ink/20"}`}
                aria-label="Toggle agent"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${a.enabled ? "left-[1.45rem]" : "left-0.5"}`} />
              </button>
            </div>
            <p className="mt-3 text-sm text-ink-500">{a.description}</p>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-300">
              <span>Last run: {a.last_run ? new Date(a.last_run).toLocaleString() : "never"}</span>
            </div>
          </Card>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
