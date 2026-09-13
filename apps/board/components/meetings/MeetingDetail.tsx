import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Surface } from "@pgpz/ui";
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Gavel,
  ListChecks,
  MapPin,
  Pencil,
  Users,
  Video,
} from "lucide-react";
import { MeetingLifecycleControls } from "./MeetingLifecycleControls";
import { MeetingRecordsManager } from "./MeetingRecordsManager";
import { MeetingRsvp } from "./MeetingRsvp";
import { MeetingLibraryMaterials, RemoveMeetingLibraryReference } from "./MeetingLibraryMaterials";
import { MeetingSection } from "./MeetingSection";
import { AsyncBallots } from "./AsyncBallots";
import { formatMeetingDate, formatShortMeetingDate, meetingStatusLabel, meetingTypeLabel, minutesStatusLabel } from "./meeting-format";
import type { MeetingCapabilities, MeetingDetailView } from "./types";

function EmptySection({ children }: { children: string }) {
  return <p className="rounded-2xl bg-[var(--surface-muted)] px-4 py-5 text-sm leading-6 text-[var(--muted)]">{children}</p>;
}

function SectionHeading({ icon: Icon, title, detail }: { icon: typeof FileText; title: string; detail?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="h-4.5 w-4.5" aria-hidden="true" /></span>
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">{title}</h2>
      </div>
      {detail ? <span className="text-xs font-semibold text-[var(--muted)]">{detail}</span> : null}
    </div>
  );
}

function DetailItem({ icon: Icon, label, children }: { icon: typeof FileText; label: string; children: ReactNode }) {
  return <div className="relative pl-7">
    <dt className="text-xs font-semibold text-[var(--muted)]"><Icon className="absolute left-0 top-0.5 h-4 w-4" aria-hidden="true" />{label}</dt>
    <dd className="mt-1">{children}</dd>
  </div>;
}

export function MeetingDetail({ detail, capabilities, viewerEmail }: { detail: MeetingDetailView; capabilities: MeetingCapabilities; viewerEmail?: string }) {
  const { meeting } = detail;
  const asynchronous = meeting.format === "asynchronous";
  const date = formatMeetingDate(meeting.startAt, meeting.endAt, meeting.timeZone);
  const minutes = detail.materials.filter((material) => material.section === "minutes");
  const preparation = detail.materials.filter((material) => material.section !== "minutes");
  const canManageMaterials = capabilities.canManageDocuments && ["draft", "scheduled", "materials-published"].includes(meeting.status);
  const attended = detail.attendance.filter((person) => person.status === "attended").length;
  const quorumEligibleAttended = detail.attendance.filter((person) => person.status === "attended" && person.quorumEligible !== false).length;
  const viewerAttendance = viewerEmail ? detail.attendance.find((person) => person.email.toLowerCase() === viewerEmail.toLowerCase()) : null;

  return (
    <>
      <Link href="/meetings" className="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All meetings
      </Link>

      <header className={`grid gap-4 border-b border-[var(--border)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end ${asynchronous ? "mt-4 pb-5" : "mt-6 pb-8"}`}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{meetingTypeLabel(meeting.type)}</Badge>
            {meeting.format === "asynchronous" ? <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-ink)]">Asynchronous</span> : null}
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--muted)]">{meetingStatusLabel(meeting.status)}</span>
          </div>
          <h1 className={`max-w-4xl font-semibold tracking-[-0.045em] text-[var(--foreground)] ${asynchronous ? "mt-3 text-3xl sm:text-4xl" : "mt-4 text-4xl sm:text-5xl"}`}>{meeting.title}</h1>
          {meeting.description ? asynchronous ? <details className="mt-3 max-w-3xl text-sm text-[var(--muted)]"><summary className="cursor-pointer font-semibold">About this meeting</summary><p className="mt-2 whitespace-pre-wrap leading-6">{meeting.description}</p></details> : <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--muted)]">{meeting.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/meetings/${encodeURIComponent(meeting.id)}/calendar`} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
            <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Add to calendar
          </a>
          {capabilities.canManage || (capabilities.canPrepare && meeting.status === "draft") ? (
            <Link href={`/meetings/${encodeURIComponent(meeting.id)}/edit`} className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit {capabilities.canManage ? "meeting" : "draft"}
            </Link>
          ) : null}
        </div>
      </header>

      {asynchronous && <p className="mt-4 text-sm font-medium text-[var(--muted)]">Consent window closes {date.endDate} at {date.endTime}.</p>}
      {asynchronous && <nav aria-label="Meeting sections" className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
        {[["resolutions", "Resolutions"], ["preparation", "Preparation materials"], ["action-items", "Follow-up tasks"], ["minutes", "Minutes"], ["executive-sessions", "Executive sessions"]].map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">{label}</a>)}
      </nav>}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          {meeting.format === "asynchronous" ? <AsyncBallots canCoordinateReviews={detail.canCoordinateReviews} meeting={meeting} ballots={detail.asyncBallots} canManage={capabilities.canManage} canDiscuss={capabilities.canDiscuss} documentChoices={detail.consentDocumentChoices} directorRoster={detail.directorRoster} /> : null}
          {meeting.format === "live" ? <Surface className="p-5 sm:p-6">
            <SectionHeading icon={ListChecks} title="Agenda" detail={`${detail.agendaItems.length} ${detail.agendaItems.length === 1 ? "item" : "items"}`} />
            {detail.agendaItems.length === 0 ? <EmptySection>The agenda has not been published yet.</EmptySection> : (
              <ol className="divide-y divide-[var(--border)]">
                {[...detail.agendaItems].sort((a, b) => a.order - b.order).map((item, index) => (
                  <li key={item.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">{index + 1}</span>
                    <div>
                      <h3 className="font-semibold text-[var(--foreground)]">{item.title}</h3>
                      {item.description ? <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{item.description}</p> : null}
                      <p className="mt-2 text-xs font-medium capitalize text-[var(--muted)]">{item.kind}{item.presenter ? ` · ${item.presenter}` : ""}</p>
                    </div>
                    {item.durationMinutes ? <span className="text-xs font-semibold text-[var(--muted)]">{item.durationMinutes} min</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </Surface> : null}

          <Surface id="preparation" className="scroll-mt-28 p-5 sm:p-6">
            <MeetingSection id="preparation" title="Preparation materials" detail={`${preparation.length} ${preparation.length === 1 ? "file" : "files"}`} collapsed={asynchronous}>
            {preparation.length === 0 ? <EmptySection>No preparation materials have been added.</EmptySection> : (
              <ul className="divide-y divide-[var(--border)]">
                {preparation.map((material) => (
                  <li key={material.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--primary)]"><FileText className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{material.title}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">{material.versionLabel}{material.source === "library" ? " · Library reference · Added " : " · Updated "}{formatShortMeetingDate(material.updatedAt, meeting.timeZone)}</span>
                    </span>
                    <a href={material.downloadHref} aria-label={`Download ${material.title}`} className="rounded-full border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><Download className="h-4 w-4" aria-hidden="true" /></a>
                    {canManageMaterials && material.source === "library" && <RemoveMeetingLibraryReference meeting={meeting} referenceId={material.id} title={material.title} />}
                  </li>
                ))}
              </ul>
            )}
            {canManageMaterials && <MeetingLibraryMaterials meeting={meeting} choices={detail.preparationDocumentChoices || []} />}
            </MeetingSection>
          </Surface>

          <div className={`grid gap-6 ${asynchronous ? "" : "xl:grid-cols-2"}`}>
            {meeting.format === "live" ? <Surface className="p-5 sm:p-6">
              <SectionHeading icon={Gavel} title="Decisions & votes" detail={`${detail.decisions.length}`} />
              {detail.decisions.length === 0 ? <EmptySection>No decisions have been recorded.</EmptySection> : (
                <ul className="grid gap-3">
                  {detail.decisions.map((decision) => (
                    <li key={decision.id} className="rounded-2xl border border-[var(--border)] p-4">
                      <h3 className="text-sm font-semibold text-[var(--foreground)]">{decision.title}</h3>
                      {decision.motion ? <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{decision.motion}</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--muted)]">
                        <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[var(--primary)]">{decision.outcome}</span>
                        <span>Yes {decision.yes}</span><span>No {decision.no}</span><span>Abstain {decision.abstain}</span>{decision.recused ? <span>Recused {decision.recused}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Surface> : null}

            <Surface id="action-items" className="scroll-mt-28 p-5 sm:p-6">
              <MeetingSection id="action-items" title={asynchronous ? "Follow-up tasks" : "Action items"} detail={`${detail.actionItems.length}`} collapsed={asynchronous}>
              {detail.actionItems.length === 0 ? <EmptySection>No action items have been recorded.</EmptySection> : (
                <ul className="grid gap-3">
                  {detail.actionItems.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 rounded-2xl border border-[var(--border)] p-4">
                      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${item.status === "completed" ? "text-emerald-700" : "text-[var(--muted)]"}`} aria-hidden="true" />
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">{item.title}</h3>
                        <p className="mt-1 text-xs capitalize text-[var(--muted)]">{item.status} · {item.owner}{item.dueAt ? ` · Due ${formatShortMeetingDate(item.dueAt, meeting.timeZone)}` : ""}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              </MeetingSection>
            </Surface>
          </div>

          <Surface id="minutes" className="scroll-mt-28 p-5 sm:p-6">
            <MeetingSection id="minutes" title="Minutes" detail={minutesStatusLabel(meeting.minutesStatus)} collapsed={asynchronous}>
            <p className="mb-4 text-xs leading-5 text-[var(--muted)]">Minutes and later amendments remain with this meeting&apos;s preserved record.</p>
            {minutes.length === 0 ? <EmptySection>{meeting.status === "draft" || meeting.status === "scheduled" || meeting.status === "materials-published" ? "Minutes will be added after the meeting." : "Draft minutes have not been added yet."}</EmptySection> : (
              <ul className="grid gap-3">
                {minutes.map((material) => <li key={material.id}><a href={material.downloadHref} className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] p-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><span>{material.title}<span className="mt-1 block text-xs font-normal text-[var(--muted)]">{material.versionLabel}</span></span><Download className="h-4 w-4" aria-hidden="true" /></a></li>)}
              </ul>
            )}
            </MeetingSection>
          </Surface>

          {capabilities.canPrepare || capabilities.canManageDocuments ? <details className="rounded-2xl border border-[var(--border)] bg-white p-5" open={!asynchronous}><summary className="cursor-pointer font-semibold">Preparation tools</summary><MeetingRecordsManager meeting={meeting} agendaCount={detail.agendaItems.length} materials={detail.materials.filter((material) => material.source !== "library")} canManage={capabilities.canManage} canPrepare={capabilities.canPrepare} canManageDocuments={capabilities.canManageDocuments} /></details> : null}
        </div>

        <aside className="grid gap-5 lg:sticky lg:top-24">
          {meeting.format === "live" && ["scheduled", "materials-published"].includes(meeting.status) ? <MeetingRsvp meeting={meeting} currentStatus={viewerAttendance?.status || null} /> : null}
          <Surface className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Meeting details</h2>
            <dl className="mt-4 grid gap-4 text-sm">
              <DetailItem icon={CalendarPlus} label={asynchronous ? "Consent collection opens" : "Meeting starts"}>
                <time dateTime={meeting.startAt}><span className="block font-semibold text-[var(--foreground)]">{date.date}</span><span className="mt-1 block text-[var(--muted)]">{date.startTime}</span></time>
              </DetailItem>
              <DetailItem icon={Clock3} label={asynchronous ? "Consent collection closes" : "Meeting ends"}>
                <time dateTime={meeting.endAt}><span className="block font-semibold text-[var(--foreground)]">{date.endDate}</span><span className="mt-1 block text-[var(--muted)]">{date.endTime}</span></time>
              </DetailItem>
              {!asynchronous && <DetailItem icon={MapPin} label="Location"><span className="text-[var(--muted)]">{meeting.location || "Location to be confirmed"}</span></DetailItem>}
              {meeting.virtualUrl && <DetailItem icon={Video} label="Online meeting"><a href={meeting.virtualUrl} rel="noreferrer" className="font-semibold text-[var(--primary)] underline decoration-[var(--border-strong)] underline-offset-4">Open meeting link</a></DetailItem>}
              {!asynchronous && <DetailItem icon={Users} label="Attendance"><span className="text-[var(--muted)]">{attended > 0 ? `${attended} recorded as attended` : `${detail.attendance.length} invited`}{meeting.quorumRequired ? <span className="mt-1 block text-xs font-semibold text-[var(--foreground)]">{meeting.quorumConfirmedAt ? "Quorum confirmed" : `${quorumEligibleAttended} of ${meeting.quorumRequired} required for quorum`}</span> : null}</span></DetailItem>}
            </dl>
          </Surface>

          {capabilities.canManage || capabilities.canPrepare ? <details className="rounded-2xl border border-[var(--border)] bg-white p-4" open={!asynchronous}><summary className="cursor-pointer font-semibold">Meeting management</summary><MeetingLifecycleControls meeting={meeting} capabilities={capabilities} deliveryCount={detail.deliveries.length} quorumEligibleAttended={quorumEligibleAttended} /></details> : null}
        </aside>
      </div>
    </>
  );
}
