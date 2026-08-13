import { Badge, Container, Surface } from "@pgpz/ui";
import { ScrollText, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { requireBoardAdministration, canManageBoardUsers, canReviewBoardAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Board Administration",
  robots: { index: false, follow: false, nocache: true },
};

export default async function BoardAdminPage() {
  const administrator = await requireBoardAdministration("/admin");

  return (
    <Container className="py-12 sm:py-16">
      <section className="max-w-3xl">
        <Badge tone="accent">Privileged access</Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Board administration
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--muted)]">Manage Board access and review recorded site activity.</p>
      </section>

      <Surface className="mt-10 max-w-3xl p-7 sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-xl font-semibold text-[var(--foreground)]">Available tools</h2>
        {canReviewBoardAudit(administrator) ? (
          <Link
            href="/admin/audit"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            Review audit ledger
          </Link>
        ) : null}
        {canManageBoardUsers(administrator) ? (
          <Link
            href="/admin/users"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Manage users
          </Link>
        ) : null}
      </Surface>
    </Container>
  );
}
