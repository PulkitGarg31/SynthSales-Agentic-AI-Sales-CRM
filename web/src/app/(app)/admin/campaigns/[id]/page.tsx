"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { CampaignInspectorView } from "@/components/admin/CampaignInspector";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";

/** Full-page version of the admin campaign inspector (the drawer's big sibling). */
export default function AdminCampaignPage() {
  const { me } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campaignId = Number(params.id);

  if (!me.is_admin) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          title="Admin access required"
          line="This area is reserved for SynthSales administrators."
        />
      </div>
    );
  }

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState title="Campaign not found" line="That id doesn't point at anything." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <BackLink href="/admin?tab=campaigns" label="Control room" />
        <div>
          <Eyebrow>Site administration</Eyebrow>
          <h1 className="display mt-1.5 text-3xl sm:text-4xl">Campaign inspector</h1>
        </div>
      </header>
      <CampaignInspectorView
        campaignId={campaignId}
        // The campaign is gone - the only sensible place left is the list.
        onDeleted={() => router.push("/admin?tab=campaigns")}
      />
    </div>
  );
}
