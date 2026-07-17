import dynamicImport from "next/dynamic";
import { resolveAppSession } from "@/lib/app-session";
import { AdminShellSkeleton } from "@/components/admin/AdminSkeleton";
import { getPolicyUpdateSummaries } from "@/lib/policy-updates";

export const dynamic = "force-dynamic";

const AdminConsole = dynamicImport(() => import("./admin-console").then((mod) => mod.AdminConsole), {
  loading: () => <AdminShellSkeleton />,
});

export default async function AdminPage() {
  let adminUserId: string | null = null;
  try {
    const session = await resolveAppSession();
    adminUserId = session?.user?.id || null;
  } catch (err) {
    console.error("Admin page session load failed", err);
  }
  return (
    <AdminConsole initialUpdates={getPolicyUpdateSummaries()} currentAdminId={adminUserId} />
  );
}
