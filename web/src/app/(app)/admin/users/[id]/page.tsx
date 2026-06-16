"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { UserTreeView } from "@/components/admin/UserTreeDrawer";
import { BackLink } from "@/components/ui/BackLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";

/** Full-page version of the admin user drill-down (the drawer's big sibling). */
export default function AdminUserPage() {
  const { me } = useAuth();
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);

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

  if (!Number.isInteger(userId) || userId <= 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState title="User not found" line="That id doesn't point at anyone." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <BackLink href="/admin?tab=users" label="Control room" />
        <div>
          <Eyebrow>Site administration</Eyebrow>
          <h1 className="display mt-1.5 text-3xl sm:text-4xl">User data</h1>
        </div>
      </header>
      <UserTreeView userId={userId} />
    </div>
  );
}
