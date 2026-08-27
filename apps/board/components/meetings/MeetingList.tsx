import Link from "next/link";
import { Badge, Surface } from "@pgpz/ui";
import { ArrowRight, CalendarDays, Clock3, MapPin, Plus } from "lucide-react";
import { formatMeetingDate, meetingStatusLabel, meetingTypeLabel } from "./meeting-format";
import type { MeetingSummaryView } from "./types";

export function MeetingList({
  meetings,
  scope,
  canManage,
  canPrepare = canManage,
}: {
  meetings: MeetingSummaryView[];
  scope: "upcoming" | "past";
  canManage: boolean;
  canPrepare?: boolean;
}) {
  const nextMeetingId = scope === "upcoming" ? meetings.find((meeting) => meeting.status !== "cancelled")?.id : undefined;
  return (
    <>
      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Meeting views" className="inline-flex w-fit rounded-full border border-[var(--border)] bg-white p-1">
          <Link
            href="/meetings?view=upcoming"
            aria-current={scope === "upcoming" ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${scope === "upcoming" ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            Upcoming
          </Link>
          <Link
            href="/meetings?view=past"
            aria-current={scope === "past" ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${scope === "past" ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            Past meetings
          </Link>
        </nav>
        {canPrepare ? (
          <Link href="/meetings/new" className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
            <Plus className="h-4 w-4" aria-hidden="true" /> {canManage ? "Create meeting" : "Create meeting draft"}
          </Link>
        ) : null}
      </div>

      {meetings.length === 0 ? (
        <Surface className="mt-5 p-8 text-center sm:p-12">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <CalendarDays className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-semibold text-[var(--foreground)]">
            {scope === "upcoming" ? "No upcoming meetings" : "No past meetings yet"}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
            {scope === "upcoming"
              ? canPrepare
                ? "Schedule the next Board meeting when its date and time are ready."
                : "The next meeting will appear here when it is scheduled."
              : "Completed meetings and their retained records will appear here."}
          </p>
        </Surface>
      ) : (
        <ol className="mt-5 grid gap-4">
          {meetings.map((meeting) => {
            const date = formatMeetingDate(meeting.startAt, meeting.endAt, meeting.timeZone);
            const location = meeting.format === "asynchronous" ? "Authenticated written vote" : meeting.location || (meeting.virtualUrl ? "Online" : "Location to be confirmed");
            return (
              <li key={meeting.id}>
                <Surface className={`p-0 ${meeting.id === nextMeetingId ? "border-[var(--accent-border)]" : ""}`}>
                  <Link href={`/meetings/${encodeURIComponent(meeting.id)}`} className="group grid gap-5 rounded-[inherit] p-5 transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-center sm:p-6">
                    <span className="block border-b border-[var(--border)] pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
                      <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{date.date.split(",")[0]}</span>
                      <span className="mt-1 block text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">{date.date.replace(/^[^,]+, /, "")}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        {meeting.id === nextMeetingId ? <Badge tone="accent">Next meeting</Badge> : null}
                        <span className="text-xs font-semibold text-[var(--muted)]">{meeting.format === "asynchronous" ? "Asynchronous resolution" : meetingTypeLabel(meeting.type)} · {meetingStatusLabel(meeting.status)}</span>
                      </span>
                      <span className="mt-2 block text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">{meeting.title}</span>
                      {meeting.description ? <span className="mt-1 line-clamp-2 block text-sm leading-6 text-[var(--muted)]">{meeting.description}</span> : null}
                      <span className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[var(--muted)]">
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{date.time}</span>
                        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{location}</span>
                      </span>
                    </span>
                    <ArrowRight className="hidden h-5 w-5 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--foreground)] sm:block" aria-hidden="true" />
                  </Link>
                </Surface>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
