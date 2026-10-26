"use client";

import { Download } from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRows } from "@/components/ui/Skeleton";

const TH =
  "sticky top-0 whitespace-nowrap border-b border-line bg-paper px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The campaign's original uploaded CSV: a scrollable preview table (first
 *  rows, parsed server-side) + a download of the exact file. */
export function CsvModal({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const csv = useApi(() => api.campaignCsv(campaignId), [campaignId]);
  const { busy, run } = useAction();
  const data = csv.data;
  // A ragged file can have rows wider than its header; show every cell.
  const cols = data ? Math.max(data.headers.length, ...data.rows.map((r) => r.length)) : 0;

  const download = () =>
    void run("csv-download", async () => {
      const text = await api.campaignCsvText(campaignId);
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = data?.filename || `campaign-${campaignId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

  return (
    <Modal open wide onClose={onClose} title="Uploaded CSV">
      {csv.loading && !data ? (
        <SkeletonRows n={4} />
      ) : csv.error ? (
        <ErrorCard message={csv.error} onRetry={csv.reload} />
      ) : data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              <span className="font-medium text-ink">{data.filename}</span> ·{" "}
              <span className="tabular-nums">{data.total_rows}</span>{" "}
              {data.total_rows === 1 ? "row" : "rows"} · {formatBytes(data.size_bytes)} · uploaded{" "}
              {new Date(data.uploaded_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
            <Button variant="secondary" busy={busy === "csv-download"} onClick={download}>
              <Download size={15} strokeWidth={1.75} aria-hidden /> Download CSV
            </Button>
          </div>

          {data.rows.length === 0 ? (
            <p className="py-8 text-center font-serif italic text-ink-soft">
              This file has no data rows.
            </p>
          ) : (
            <div className="max-h-[55vh] overflow-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={`${TH} text-right`}>
                      <span className="sr-only">Row</span>#
                    </th>
                    {Array.from({ length: cols }, (_, i) => (
                      <th key={i} className={TH}>
                        {data.headers[i] || `Column ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((row, r) => (
                    <tr key={r}>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{r + 1}</td>
                      {Array.from({ length: cols }, (_, c) => (
                        <td key={c} className="max-w-[18rem] truncate px-3 py-2" title={row[c] ?? ""}>
                          {row[c] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.rows.length < data.total_rows && (
            <p className="text-xs text-ink-soft">
              Showing the first {data.rows.length} of {data.total_rows} rows. Download for the full
              file.
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
