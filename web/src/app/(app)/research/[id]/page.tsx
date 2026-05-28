"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorBox, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { CompanyDetail } from "./CompanyDetail";

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data, loading, error, reload } = useApi(() => api.company(id), [id]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/research"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink"
      >
        ← Back to research
      </Link>
      {loading ? (
        <Loading label="Loading company…" />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : data ? (
        <CompanyDetail company={data} onChange={reload} />
      ) : null}
    </div>
  );
}
