import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { resolveAppSession } from "@/lib/app-session";
import { AdminShell } from "@/components/admin/AdminShell";
import { isAdminSession } from "@/lib/admin/auth";

export const metadata = {
  title: "Admin | PGPZ Community",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await resolveAppSession();
  if (!session) {
    redirect("/signin?callbackUrl=/admin");
  }
  if (!isAdminSession(session)) {
    redirect("/");
  }

  const user = (session as any).user || {};
  const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Admin";
  const email = typeof user.email === "string" ? user.email : null;

  return (
    <AdminShell name={name} email={email}>
      {children}
    </AdminShell>
  );
}
