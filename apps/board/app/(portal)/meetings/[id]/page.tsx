import { notFound } from "next/navigation";
import { Container } from "@pgpz/ui";
import { MeetingDetail } from "@/components/meetings/MeetingDetail";
import type { MeetingDetailView } from "@/components/meetings/types";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { boardAsyncBallotEffectiveStatus, canEditBoardAsyncDiscussionMessage } from "@/lib/meetings";
import { canManageBoardDocuments, canManageBoardMeetings, canParticipateBoardDiscussions, canPrepareBoardMeetings, requireBoardMember } from "@/lib/session";
import { boardDocumentRepository } from "@/lib/vault";
import { ExecutiveSessions } from "@/components/meetings/ExecutiveSessions";
import { executiveAccessRecord, listExecutiveCandidates, visibleExecutiveSessions } from "@/lib/executive-session-access";
import { canCreateExecutiveSession, isDirectorRole } from "@/lib/executive-sessions";
import { executiveSessionsRepository } from "@/lib/executive-sessions-repository";
import { readDirectorRoster } from "@/lib/director-roster";

export const dynamic = "force-dynamic";
export const metadata = { title: "Board Meeting", robots: { index: false, follow: false, nocache: true } };

export default async function BoardMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireBoardMember(`/meetings/${encodeURIComponent(id)}`);
  if (!member) return null;
  const [record, meetingDocuments] = await Promise.all([
    boardMeetingsRepository.getMeeting(id),
    boardDocumentRepository.listMeetingDocuments(id),
  ]);
  if (!record || (record.meeting.status === "draft" && !canManageBoardMeetings(member) && !canPrepareBoardMeetings(member))) notFound();
  const canManageMeetings = canManageBoardMeetings(member);
  const canDiscuss = canParticipateBoardDiscussions(member);
  const [directorRoster, libraryDocuments] = record.meeting.format === "asynchronous"
    ? await Promise.all([readDirectorRoster(), canManageMeetings ? boardDocumentRepository.listDocuments({ status: "active" }) : Promise.resolve([])])
    : [null, []];
  const renderedAt = Date.now();
  const [executiveSessions, executiveReports, accessRecord] = await Promise.all([
    visibleExecutiveSessions(member, id), executiveSessionsRepository.reports(id), executiveAccessRecord(member),
  ]);
  const candidates = accessRecord?.status === "active" && canCreateExecutiveSession(accessRecord.role) &&
    ["scheduled", "materials-published"].includes(record.meeting.status)
    ? (await listExecutiveCandidates()).map((p) => ({ id: p.id, name: p.name, email: p.email, kind: isDirectorRole(p.role) ? "director" as const : "counsel" as const })) : null;

  const detail: MeetingDetailView = {
    directorRoster: canManageMeetings ? directorRoster : null,
    consentDocumentChoices: [...libraryDocuments, ...meetingDocuments.filter((doc) => doc.status === "active")].map((doc) => ({
      documentId: doc.documentId, versionId: doc.currentVersion.versionId, title: doc.displayName || doc.title,
      sequence: doc.currentVersion.sequence, fileName: doc.currentVersion.originalFileName, sha256: doc.currentVersion.sha256,
    })),
    meeting: {
      id: record.meeting.id, title: record.meeting.title, description: record.meeting.description,
      type: record.meeting.type, format: record.meeting.format, status: record.meeting.status, startAt: record.meeting.startAt,
      endAt: record.meeting.endAt, timeZone: record.meeting.timeZone, location: record.meeting.location || null,
      virtualUrl: record.meeting.virtualUrl, version: record.meeting.version, minutesStatus: record.meeting.minutesStatus,
      quorumRequired: record.meeting.quorumRequired, quorumConfirmedAt: record.meeting.quorumConfirmedAt, quorumConfirmedBy: record.meeting.quorumConfirmedBy,
    },
    agendaItems: record.agendaItems.filter((item) => item.status === "active").map((item) => ({
      id: item.id, title: item.title, description: item.description, kind: item.kind, order: item.order,
      presenter: item.presenter || null, durationMinutes: item.allottedMinutes,
    })),
    materials: meetingDocuments.filter((document) => document.status === "active").map((document) => ({
      id: document.documentId,
      title: document.displayName || document.title,
      description: document.description,
      section: document.meetingSection || "other",
      downloadHref: `/api/documents/${encodeURIComponent(document.documentId)}/download`,
      versionLabel: `v${document.currentVersion.sequence}`,
      updatedAt: document.updatedAt,
    })),
    attendance: record.attendance.map((person) => ({ id: person.userId, name: person.name, email: person.email, status: person.status, quorumEligible: person.quorumEligible })),
    decisions: record.decisions.map((decision) => ({
      id: decision.id, title: decision.title, motion: decision.motion, outcome: decision.outcome,
      yes: decision.yes, no: decision.no, abstain: decision.abstain, recused: decision.recused,
    })),
    asyncBallots: record.asyncBallots.filter((ballot) => canManageMeetings || ballot.status !== "draft").map((ballot) => {
      const votes = record.asyncVotes.filter((vote) => vote.ballotId === ballot.id);
      const viewerVote = votes.find((vote) => vote.voterEmail === member.email);
      const effectiveStatus = boardAsyncBallotEffectiveStatus(ballot, record.meeting);
      return {
        consentMode: ballot.consentMode,
        attachments: ballot.attachments,
        consent: ballot.consent ? {
          contentHash: ballot.consent.contentHash, startAt: ballot.consent.startAt, endAt: ballot.consent.endAt,
          statement: ballot.consent.statement, withdrawalStatement: ballot.consent.withdrawalStatement,
          directors: ballot.eligibleVoters,
          viewerReceipt: ballot.consent.receipts.find((receipt) => receipt.email === member.email && receipt.accessId === accessRecord?.id) || null,
          rosterChanged: directorRoster?.revision !== ballot.consent.rosterRevision,
          adoptedAt: ballot.closedAt,
        } : null,
        id: ballot.id, title: ballot.title, motion: ballot.motion,
        effectiveStatus,
        eligibleCount: ballot.eligibleVoters.length, ballotsCast: ballot.consent ? ballot.consent.receipts.filter((receipt) => receipt.action === "consent").length : votes.length,
        quorumRequired: ballot.quorumRequired, approvalRequired: ballot.approvalRequired,
        viewerEligible: accessRecord?.status === "active" && isDirectorRole(accessRecord.role) && ballot.eligibleVoters.some((voter) => voter.email === member.email && voter.userId === accessRecord.id),
        viewerChoice: viewerVote?.choice || null,
        discussionMessages: record.asyncDiscussionMessages.filter((message) => message.ballotId === ballot.id).map((message) => ({
          id: message.id, replyToMessageId: message.replyToMessageId,
          authorName: message.authorName, authorEmail: message.authorEmail, body: message.body,
          createdAt: message.createdAt, updatedAt: message.updatedAt, editedAt: message.editedAt,
          canEdit: canDiscuss && effectiveStatus === "open" && canEditBoardAsyncDiscussionMessage(message, member.id, renderedAt),
        })),
        result: ballot.status === "closed" ? ballot.result : null,
      };
    }),
    actionItems: record.actionItems.map((item) => ({
      id: item.id, title: item.description, owner: item.ownerName, dueAt: item.dueAt, status: item.status,
    })),
    deliveries: record.deliveries.map((delivery) => ({
      id: delivery.id, kind: delivery.kind, status: delivery.status, sentAt: delivery.occurredAt,
      recipientCount: 1,
    })),
  };

  return (
    <Container className="max-w-[90rem] py-8 sm:px-8 sm:py-12 lg:px-12">
      <MeetingDetail detail={detail} viewerEmail={member.email} capabilities={{ canManage: canManageMeetings, canPrepare: canPrepareBoardMeetings(member), canManageDocuments: canManageBoardDocuments(member), canDiscuss }} />
      {executiveReports.length > 0 && <section className="mt-8 rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-7">
        <h2 className="text-xl font-semibold">Reviewed executive-session outcomes</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Published summaries for all Board portal users. These reports do not constitute formal votes or consents.</p>
        {executiveReports.map((report) => <article key={report.id} className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="text-xs text-[var(--muted)]">Published by {report.publishedBy} on {new Date(report.publishedAt).toLocaleString()}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{report.summary}</p>
        </article>)}
      </section>}
      <ExecutiveSessions meetingId={id} sessions={executiveSessions.map((s) => ({ id: s.id, title: s.title, status: s.status }))} candidates={candidates} />
    </Container>
  );
}
