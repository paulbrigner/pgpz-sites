import { Badge, Container, Surface } from "@pgpz/ui";
import { ShieldCheck } from "lucide-react";
import { requireBoardAdmin, canReviewBoardAudit } from "@/lib/session";
import { boardAuditLedger } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit Ledger",
  robots: { index: false, follow: false, nocache: true },
};

const outcomeTone = (outcome: string) =>
  outcome === "success" ? "success" : outcome === "denied" ? "warning" : "neutral";

export default async function BoardAuditPage() {
  const admin = await requireBoardAdmin("/admin/audit");
  if (!canReviewBoardAudit(admin)) return null;

  const [events, verification] = await Promise.all([
    boardAuditLedger.list({ limit: 100 }),
    boardAuditLedger.verify(),
  ]);

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
        <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4">
          <ShieldCheck className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          <span className="text-sm font-semibold text-[var(--foreground)]">Recent events</span>
        </div>
        {events.length === 0 ? (
          <p className="px-6 py-10 text-sm text-[var(--muted)]">No audit events recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {events.map((event) => (
              <li key={event.eventId} className="grid gap-1 px-6 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center">
                <Badge tone={outcomeTone(event.outcome)}>{event.outcome}</Badge>
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
      </Surface>
    </Container>
  );
}
