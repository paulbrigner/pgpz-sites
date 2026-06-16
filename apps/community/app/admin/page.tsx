import dynamicImport from "next/dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { AdminShellSkeleton } from "@/components/admin/AdminSkeleton";
import { PolicyUpdateMailer } from "@/components/admin/PolicyUpdateMailer";
import { getPolicyUpdateSummaries } from "@/lib/policy-updates";

export const dynamic = "force-dynamic";

const AdminClient = dynamicImport(() => import("./admin-client"), {
  loading: () => <AdminShellSkeleton />,
});

export default async function AdminPage() {
  let adminUserId: string | null = null;
  try {
    const session = await getServerSession(authOptions as any);
    adminUserId = (session as any)?.user?.id || null;
  } catch (err) {
    console.error("Admin page session load failed", err);
  }
  return (
    <div className="space-y-6">
      <PolicyUpdateMailer initialUpdates={getPolicyUpdateSummaries()} />
      <AdminClient initialRoster={null} currentAdminId={adminUserId} />
    </div>
  );
}
