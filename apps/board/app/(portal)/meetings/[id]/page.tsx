import { notFound } from "next/navigation";
import { Container } from "@pgpz/ui";
import { MeetingDetail } from "@/components/meetings/MeetingDetail";
import type { MeetingDetailView } from "@/components/meetings/types";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { canManageBoardDocuments, canManageBoardMeetings, canPrepareBoardMeetings, requireBoardMember } from "@/lib/session";
import { boardDocumentRepository } from "@/lib/vault";

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

  const detail: MeetingDetailView = {
    meeting: {
      id: record.meeting.id, title: record.meeting.title, description: record.meeting.description,
      type: record.meeting.type, status: record.meeting.status, startAt: record.meeting.startAt,
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
      <MeetingDetail detail={detail} viewerEmail={member.email} capabilities={{ canManage: canManageBoardMeetings(member), canPrepare: canPrepareBoardMeetings(member), canManageDocuments: canManageBoardDocuments(member) }} />
    </Container>
  );
}
