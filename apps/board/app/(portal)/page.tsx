import { BoardDashboard } from "@/components/dashboard/BoardDashboard";
import { canManageBoardMeetings, canPrepareBoardMeetings, requireBoardMember } from "@/lib/session";
import { getBoardPasskeyCount } from "@/lib/passkey-enrollment";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { boardDocumentRepository } from "@/lib/vault";

export const dynamic = "force-dynamic";

export default async function BoardHomePage() {
  const member = await requireBoardMember("/");
  if (!member) return null;

  const [passkeyCount, upcoming] = await Promise.all([
    getBoardPasskeyCount(member.id),
    boardMeetingsRepository.listMeetings({ scope: "upcoming", limit: 10 }),
  ]);
  const maySeeDrafts = canManageBoardMeetings(member) || canPrepareBoardMeetings(member);
  const next = upcoming.meetings.find((meeting) => meeting.status !== "cancelled" && (meeting.status !== "draft" || maySeeDrafts)) || null;
  const materialCount = next ? (await boardDocumentRepository.listMeetingDocuments(next.id)).filter((document) => document.status === "active").length : 0;
  const nextMeeting = next ? {
    id: next.id, title: next.title, description: next.description, type: next.type, format: next.format, status: next.status,
    startAt: next.startAt, endAt: next.endAt, timeZone: next.timeZone, location: next.location || null,
    virtualUrl: next.virtualUrl, version: next.version, minutesStatus: next.minutesStatus, materialCount,
    quorumRequired: next.quorumRequired, quorumConfirmedAt: next.quorumConfirmedAt, quorumConfirmedBy: next.quorumConfirmedBy,
  } : null;
  return <BoardDashboard member={member} passkeyCount={passkeyCount} nextMeeting={nextMeeting} />;
}
