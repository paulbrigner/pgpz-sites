import Link from "next/link";
import { Badge, Container, Surface } from "@pgpz/ui";
import { ArrowRight, CalendarDays, FileText, KeyRound, ScrollText, Settings, ShieldCheck } from "lucide-react";
import type { BoardMember } from "@/lib/session";
import { formatMeetingDate, formatShortMeetingDate, meetingStatusLabel } from "@/components/meetings/meeting-format";
import type { MeetingSummaryView } from "@/components/meetings/types";
import { GovernanceSafeguardsNotice } from "@/components/governance/GovernanceSafeguardsNotice";

export type { BoardMember };

const memberResources = [
  {
    href: "/documents",
    icon: FileText,
    title: "Document library",
    body: "Governance records, policies, agreements, and version history",
  },
  {
    href: "/meetings",
    icon: CalendarDays,
    title: "Board meetings",
    body: "Upcoming meetings, agendas, preparation materials, decisions, and minutes",
  },
  {
    href: "/account/security",
    icon: KeyRound,
    title: "Sign-in security",
    body: "Passkeys and account recovery",
  },
  {
    href: "/governance-safeguards",
    icon: ShieldCheck,
    title: "Governance safeguards",
    body: "How Board records are preserved, verified, and protected",
  },
] as const;

function roleLabel(member: BoardMember) {
  if (member.role === "chair" || member.role === "admin") return "Board Chair";
  if (member.role === "executive-director") return "Executive Director";
  if (member.role === "legal-counsel") return "Legal Counsel";
  if (member.role === "board-support") return "Board Support";
  return "Board of Directors";
}

function canAccessAdministration(member: BoardMember) {
  return ["chair", "admin", "executive-director", "legal-counsel"].includes(member.role);
}

export function BoardDashboard({ member, passkeyCount = null, nextMeeting = null }: { member: BoardMember; passkeyCount?: number | null; nextMeeting?: (MeetingSummaryView & { materialCount: number }) | null }) {
  return (
    <Container className="py-10 sm:py-14">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{roleLabel(member)}</Badge>
        </div>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl">
          Welcome, {member.name}.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Signed in as <span className="font-semibold text-[var(--foreground)]">{member.email}</span>.
        </p>
      </section>

      {passkeyCount === 0 ? (
        <Surface className="mt-8 border-[var(--accent-border)] bg-[var(--accent-soft)] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Make your next sign-in faster and safer</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Add a passkey to use your device’s screen lock instead of waiting for an email link. Email remains available for recovery.</p>
          </div>
          <Link href="/account/security" className="mt-4 inline-flex shrink-0 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white sm:mt-0">Add a passkey</Link>
        </Surface>
      ) : null}

      <GovernanceSafeguardsNotice />

      <section className="mt-10" aria-labelledby="board-resources-heading">
        <h2 id="board-resources-heading" className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">Board resources</h2>
        <Surface className="mt-4 overflow-hidden p-0">
          <ul className="divide-y divide-[var(--border)]">
            {memberResources.map((resource) => {
              const { href, icon: Icon, title, body } = resource;
              const meetingDate = title === "Board meetings" && nextMeeting ? formatMeetingDate(nextMeeting.startAt, nextMeeting.endAt, nextMeeting.timeZone) : null;
              const resourceBody = title === "Board meetings"
                ? meetingDate && nextMeeting
                  ? `${formatShortMeetingDate(nextMeeting.startAt, nextMeeting.timeZone)} · ${meetingDate.time} · ${meetingStatusLabel(nextMeeting.status)} · ${nextMeeting.materialCount} ${nextMeeting.materialCount === 1 ? "material" : "materials"}`
                  : "No upcoming meeting scheduled"
                : body;
              const content = (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <h3 className="font-semibold tracking-[-0.015em] text-[var(--foreground)]">{title}</h3>
                    <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">{resourceBody}</span>
                  </span>
                  {href === "/account/security" && passkeyCount !== null ? (
                    <span className="hidden shrink-0 text-xs font-semibold text-[var(--muted)] sm:inline">
                      {passkeyCount} {passkeyCount === 1 ? "passkey" : "passkeys"}
                    </span>
                  ) : null}
                  {href ? <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--foreground)]" aria-hidden="true" /> : null}
                </>
              );

              return (
                <li key={title}>
                  {href ? (
                    <Link href={href} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] sm:px-6">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-4 px-5 py-4 sm:px-6">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Surface>
      </section>

      {canAccessAdministration(member) ? (
        <section className="mt-8" aria-labelledby="administration-heading">
          <Surface className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-ink)]"><Settings className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 id="administration-heading" className="text-xl font-semibold text-[var(--foreground)]">Board tools</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Open the audit and access tools available to your role.</p>
              </div>
            </div>
            <Link href="/admin" className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
              <ScrollText className="h-4 w-4" aria-hidden="true" /> Open Board tools
            </Link>
          </Surface>
        </section>
      ) : null}
    </Container>
  );
}
