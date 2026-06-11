"use client";

// Controlled CSV dropzone: the parent owns the File; CsvDrop validates,
// parses a preview, and reports accepted files via onFile (null on remove or
// rejection). Parsing is plain JS — quoted cells with commas and doubled
// quotes ("") are handled, but a newline INSIDE a quoted cell is treated as a
// row break (good enough for company lists; the backend's csv module is the
// source of truth on upload).

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, UploadCloud, X } from "lucide-react";

const NAME_COLUMNS = ["company_name", "company", "name"]; // mirrors the backend's `pick`
const PREVIEW_ROWS = 5;
const PREVIEW_COLS = 5;

const SAMPLE_CSV = [
  "company_name,domain,industry,country",
  "Northwind Logistics,northwind-logistics.com,Logistics,United States",
  "Brightwave Manufacturing,brightwave.io,Manufacturing,Canada",
  "Cobalt Health Systems,cobalthealth.co.uk,Healthcare,United Kingdom",
  "",
].join("\n");

interface Preview {
  headers: string[];
  rows: string[][]; // first PREVIEW_ROWS data rows
  total: number; // total data rows
}

/** Split one CSV line into cells. Handles quoted cells and doubled quotes. */
function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur === "") {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseCsv(text: string): Preview | { error: string } {
  // Strip a UTF-8 BOM (the backend decodes utf-8-sig for the same reason).
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { error: "That file is empty." };

  const headers = parseLine(lines[0]);
  const hasNameColumn = headers.some((h) => NAME_COLUMNS.includes(h.toLowerCase()));
  if (!hasNameColumn) {
    return {
      error:
        "No company-name column found. The header row needs a “company_name”, “company” or “name” column.",
    };
  }
  if (lines.length === 1) return { error: "That file only has a header row — no companies." };

  return {
    headers,
    rows: lines.slice(1, 1 + PREVIEW_ROWS).map(parseLine),
    total: lines.length - 1,
  };
}

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample-companies.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvDrop({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function accept(f: File) {
    const reject = (msg: string) => {
      setError(msg);
      setPreview(null);
      onFile(null);
    };
    if (!f.name.toLowerCase().endsWith(".csv")) {
      reject("Only .csv files are accepted.");
      return;
    }
    if (f.size === 0) {
      reject("That file is empty.");
      return;
    }
    let text: string;
    try {
      text = await f.text();
    } catch {
      reject("Couldn’t read that file. Try again.");
      return;
    }
    const parsed = parseCsv(text);
    if ("error" in parsed) {
      reject(parsed.error);
      return;
    }
    setError(null);
    setPreview(parsed);
    onFile(f);
  }

  function remove() {
    setPreview(null);
    setError(null);
    onFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (file) {
    const moreRows = preview ? preview.total - preview.rows.length : 0;
    const moreCols = preview ? preview.headers.length - PREVIEW_COLS : 0;
    return (
      <div className="rounded-2xl border border-line bg-cream/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <FileSpreadsheet aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-moss" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{file.name}</p>
            {preview && (
              <p className="text-xs text-ink-soft">
                {preview.total} {preview.total === 1 ? "company" : "companies"} detected
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={remove}
            aria-label="Remove file"
            className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-cream hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        {preview && (
          <div className="overflow-x-auto border-t border-line px-4 py-3">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr>
                  {preview.headers.slice(0, PREVIEW_COLS).map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium text-ink-faint">
                      {h}
                      {moreCols > 0 && i === PREVIEW_COLS - 1 && (
                        <span className="ml-2 font-normal">+{moreCols} more</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, r) => (
                  <tr key={r} className="border-t border-line/60">
                    {preview.headers.slice(0, PREVIEW_COLS).map((_, c) => (
                      <td key={c} className="max-w-48 truncate px-2 py-1 text-ink-soft">
                        {row[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {moreRows > 0 && (
              <p className="mt-2 px-2 font-mono text-xs text-ink-faint">+{moreRows} more rows</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void accept(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? "border-terracotta bg-terracotta/5" : "border-line bg-cream/40 hover:border-ink/40"
        }`}
      >
        <UploadCloud aria-hidden size={26} strokeWidth={1.5} className="text-ink-soft" />
        <span className="mt-3 text-sm font-medium text-ink">
          Drop your CSV here, or click to browse
        </span>
        <span className="mt-1 text-xs text-ink-soft">
          Needs a company-name column; domain, industry and country help.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void accept(f);
          }}
        />
      </label>
      {error && <p className="text-xs text-rust">{error}</p>}
      <button
        type="button"
        onClick={downloadSample}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-terracotta hover:underline"
      >
        <Download size={14} strokeWidth={1.75} /> Download sample CSV
      </button>
    </div>
  );
}
