import { Badge, Container, Surface } from "@pgpz/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleMinus, RefreshCw, ShieldCheck } from "lucide-react";
import { requireBoardAdministration, canReviewBoardAudit } from "@/lib/session";
import { boardAuditLedger } from "@/lib/audit";
import { AUDIT_PAGE_SIZE, resolveAuditPage } from "@/lib/audit-pagination";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit Ledger",
  robots: { index: false, follow: false, nocache: true },
};

function OutcomeIcon({ outcome }: { outcome: string }) {
  const Icon = outcome === "success" ? CircleCheck : outcome === "denied" ? CircleAlert : CircleMinus;
  const color = outcome === "success" ? "text-emerald-700" : outcome === "denied" ? "text-amber-700" : "text-[var(--muted)]";
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center ${color}`} title={`Outcome: ${outcome}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Outcome: {outcome}</span>
    </span>
  );
}

export default async function BoardAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const administrator = await requireBoardAdministration("/admin/audit");
  if (!canReviewBoardAudit(administrator)) notFound();

  const params = await searchParams;
  const [verification, head] = await Promise.all([
    boardAuditLedger.verify(),
    boardAuditLedger.readHead(),
  ]);
  const pagination = resolveAuditPage(params?.page, verification.entryCount, head?.sequence ?? null);
  const events = await boardAuditLedger.listNewest({
    beforeSequenceExclusive: pagination.beforeSequenceExclusive,
    limit: AUDIT_PAGE_SIZE,
  });

  return (
    <Container className="py-12 sm:py-16">
      <section className="max-w-4xl">
        <Badge tone="accent">Audit ledger</Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Board audit ledger
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
          Append-only, hash-chained record of authentication and governance-document
          activity. The chain verifies as{" "}
          <span className={verification.ok ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
            {verification.ok ? "intact" : "compromised"}
          </span>{" "}
          ({verification.entryCount} entries).
        </p>
      </section>

      <Surface className="mt-8 overflow-hidden max-w-4xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4">
          <ShieldCheck className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          <span className="text-sm font-semibold text-[var(--foreground)]">Recent events</span>
          <span className="text-xs text-[var(--muted)]">
            {pagination.firstOrdinal}–{pagination.lastOrdinal} of {verification.entryCount}
          </span>
          <form action="/admin/audit" method="get" className="ml-auto">
            <input type="hidden" name="page" value={pagination.page} />
            <button type="submit" className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
            </button>
          </form>
        </div>
        {events.length === 0 ? (
          <p className="px-6 py-10 text-sm text-[var(--muted)]">No audit events recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {events.map((event) => (
              <li key={event.eventId} className="grid gap-x-3 gap-y-1 px-6 py-4 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:items-center">
                <OutcomeIcon outcome={event.outcome} />
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {event.category} · {event.action}
                  </p>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    {event.actor.email ?? event.actor.userId ?? "unknown actor"} ·{" "}
                    {event.actor.role ?? "unauthenticated"}
                    {event.target ? ` · ${event.target.type}:${event.target.id}` : ""}
                  </p>
                </div>
                <time className="text-xs text-[var(--muted)] sm:text-right">
                  {new Date(event.occurredAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
        {verification.entryCount > AUDIT_PAGE_SIZE ? (
          <nav aria-label="Audit event pages" className="flex items-center justify-between gap-4 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4">
            {pagination.page > 1 ? (
              <Link href={`/admin/audit?page=${pagination.page - 1}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Newer
              </Link>
            ) : <span />}
            <span className="text-xs text-[var(--muted)]">Page {pagination.page} of {pagination.totalPages}</span>
            {pagination.page < pagination.totalPages ? (
              <Link href={`/admin/audit?page=${pagination.page + 1}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline">
                Older <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : <span />}
          </nav>
        ) : null}
      </Surface>
    </Container>
  );
}
