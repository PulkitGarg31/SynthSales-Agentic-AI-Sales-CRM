"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { BackLink } from "@/components/ui/BackLink";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { CompanyDetail } from "@/components/research/CompanyDetail";

function CompanyDetailInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  // Preserve the campaign the user drilled in from, so "Back to research"
  // returns to that campaign's scoped list (which itself offers "Back to
  // campaign") instead of the unscoped all-companies view.
  const campaign = Number(search.get("campaign"));
  const back =
    Number.isInteger(campaign) && campaign > 0 ? `/research?campaign=${campaign}` : "/research";
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink href={back} label="Back to research" />
      <CompanyDetail id={Number(params.id)} />
    </div>
  );
}

export default function CompanyDetailPage() {
  // Next 16: useSearchParams must sit under a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl">
          <SkeletonRows n={6} />
        </div>
      }
    >
      <CompanyDetailInner />
    </Suspense>
  );
}
