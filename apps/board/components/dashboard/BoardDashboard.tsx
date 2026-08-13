import Link from "next/link";
import { Badge, Container, Surface } from "@pgpz/ui";
import { FileText, KeyRound, Palette, ScrollText, Settings } from "lucide-react";
import type { BoardMember } from "@/lib/session";

export type { BoardMember };

const memberResources = [
  {
    href: "/documents",
    icon: FileText,
    title: "Document library",
    body: "Browse current governance records, policies, agreements, and retained document versions.",
    action: "Browse documents",
  },
  {
    href: "/brand",
    icon: Palette,
    title: "Brand & marketing",
    body: "Open the current PGPZ identity guidelines and download production-ready brand packages.",
    action: "Open brand resources",
  },
  {
    href: "/account/security",
    icon: KeyRound,
    title: "Sign-in security",
    body: "Register and manage passkeys for phishing-resistant access to the Board portal.",
    action: "Manage passkeys",
  },
] as const;

export function BoardDashboard({ member }: { member: BoardMember }) {
  return (
    <Container className="py-10 sm:py-14">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          {member.role === "executive-director" ? (
            <Badge tone="accent">Executive Director</Badge>
          ) : member.role === "legal-counsel" ? (
            <Badge tone="accent">Legal Counsel</Badge>
          ) : (
            <Badge tone="accent">Board of Directors</Badge>
          )}
          {member.isAdmin && member.role !== "executive-director" && member.role !== "legal-counsel" ? <Badge>Board administrator</Badge> : null}
        </div>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl">
          Welcome, {member.name}.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Signed in as <span className="font-semibold text-[var(--foreground)]">{member.email}</span>.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="board-resources-heading">
        <h2 id="board-resources-heading" className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">Board resources</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {memberResources.map(({ href, icon: Icon, title, body, action }) => (
            <Surface key={href} className="flex h-full flex-col p-6 sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">{title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-[var(--muted)]">{body}</p>
              <Link href={href} className="mt-5 inline-flex w-fit items-center rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
                {action}
              </Link>
            </Surface>
          ))}
        </div>
      </section>

      {member.isAdmin ? (
        <section className="mt-8" aria-labelledby="administration-heading">
          <Surface className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-ink)]"><Settings className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 id="administration-heading" className="text-xl font-semibold text-[var(--foreground)]">Administration</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Manage retained documents and review the Board activity ledger.</p>
              </div>
            </div>
            <Link href="/admin" className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
              <ScrollText className="h-4 w-4" aria-hidden="true" /> Open administration
            </Link>
          </Surface>
        </section>
      ) : null}
    </Container>
  );
}
