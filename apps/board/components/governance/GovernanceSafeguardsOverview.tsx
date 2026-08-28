import Link from "next/link";
import { Surface } from "@pgpz/ui";
import {
  BookLock,
  CheckCircle2,
  CloudCog,
  DatabaseBackup,
  FileClock,
  Fingerprint,
  History,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

const safeguards = [
  {
    icon: KeyRound,
    title: "Controlled access",
    body: "Every person signs in with a verified passkey, and each role receives only the document, meeting, or administrative capabilities it needs.",
  },
  {
    icon: History,
    title: "Preserved history",
    body: "A revised file creates another retained version. Earlier versions remain available as part of the governance record rather than being silently overwritten.",
  },
  {
    icon: Fingerprint,
    title: "Verified integrity",
    body: "The portal calculates a cryptographic fingerprint for each uploaded file so its retained contents can be checked for unexpected change.",
  },
  {
    icon: FileClock,
    title: "Accountable activity",
    body: "Important authentication, access, document, meeting, discussion, and voting actions are recorded in a tamper-evident audit ledger.",
  },
] as const;

export function GovernanceSafeguardsOverview({ showTechnicalDetails }: { showTechnicalDetails: boolean }) {
  return (
    <div className="grid gap-8">
      <Surface className="overflow-hidden p-0">
        <div className="grid gap-6 border-b border-[var(--border)] bg-[var(--surface-muted)] px-6 py-8 sm:px-9 sm:py-10 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
          <div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-ink)]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">How Board records are protected</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--muted)]">
              The Board portal is designed to support responsible governance and reliable recordkeeping. It preserves history, verifies integrity, records important activity, and limits access according to each person&apos;s role.
            </p>
          </div>
          <p className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm leading-6 text-[var(--accent-ink)]">
            These safeguards support PGPZ&apos;s governance and record-retention obligations. They are not, by themselves, a certification of legal or regulatory compliance.
          </p>
        </div>

        <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2">
          {safeguards.map(({ icon: Icon, title, body }) => (
            <section key={title} className="bg-white px-6 py-7 sm:px-9">
              <Icon className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
            </section>
          ))}
        </div>
      </Surface>

      <Surface className="overflow-hidden p-0">
        <div className="border-b border-[var(--border)] bg-[var(--primary)] px-6 py-7 text-white sm:px-8">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
              <CloudCog className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/65">AWS hosting</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Hosted for secure preservation</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-white/75">
                The Board portal operates through a dedicated set of AWS resources and permissions separated from PGPZ&apos;s other applications. Its storage, encryption, access, and recovery controls are configured specifically for Board records.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-[var(--border)] md:grid-cols-3">
          <section className="bg-white px-6 py-6 sm:px-8">
            <LockKeyhole className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
            <h3 className="mt-4 font-semibold text-[var(--foreground)]">Encrypted and isolated</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Connections use HTTPS, and Board data is encrypted at rest with Board-specific encryption and role-based access controls.</p>
          </section>
          <section className="bg-white px-6 py-6 sm:px-8">
            <BookLock className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
            <h3 className="mt-4 font-semibold text-[var(--foreground)]">Retention-protected documents</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Retained files use versioned AWS object storage with retention safeguards. The portal&apos;s normal operating role cannot delete retained versions.</p>
          </section>
          <section className="bg-white px-6 py-6 sm:px-8">
            <DatabaseBackup className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
            <h3 className="mt-4 font-semibold text-[var(--foreground)]">Protected records and recovery</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Meeting and access records use protected AWS databases with recovery, deletion protection, and preserved revision history.</p>
          </section>
        </div>
      </Surface>

      <Surface className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">What this means for Board members</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--muted)]">
              Materials added to the portal may become part of PGPZ&apos;s official governance record. Submit corrections as new versions so the prior record remains preserved. If a file was uploaded in error or contains information that should not be retained, promptly contact the Board Chair, Executive Director, or Legal Counsel rather than assuming it can be deleted.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/documents" className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">Open Document Library</Link>
              <Link href="/meetings" className="rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">Open Board meetings</Link>
            </div>
          </div>
        </div>
      </Surface>

      {showTechnicalDetails ? (
        <Surface className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <BookLock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Authorized technical overview</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">Preservation architecture</h2>
              <ul className="mt-4 grid gap-3 text-sm leading-6 text-[var(--muted)]">
                <li>Temporary uploads are isolated from retained records. The server validates a file and calculates its SHA-256 fingerprint before promoting the verified bytes.</li>
                <li>Retained document versions use encrypted, versioned object storage with retention controls. The portal&apos;s normal operating role cannot delete retained versions.</li>
                <li>The audit ledger is append-only and hash-chained so reviewers can verify whether its recorded sequence remains intact.</li>
                <li>Meeting documents use the same vault controls but appear only in their meeting record, avoiding duplicate or conflicting sources of truth.</li>
                <li>Meeting and access records use encrypted, deletion-protected data stores with recovery and immutable revision controls.</li>
              </ul>
              <Link href="/admin/audit" className="mt-5 inline-flex text-sm font-semibold text-[var(--primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--primary)]">Review the audit ledger</Link>
            </div>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
