"use client";

import { useParams } from "next/navigation";
import { CompanyDetail } from "@/components/research/CompanyDetail";

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  return <CompanyDetail id={Number(params.id)} />;
}
