import { notFound } from "next/navigation";
import { Badge, Container, Surface } from "@pgpz/ui";
import { MeetingForm } from "@/components/meetings/MeetingForm";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { canManageBoardMeetings, canPrepareBoardMeetings, requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Board Meeting", robots: { index: false, follow: false, nocache: true } };

export default async function EditBoardMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireBoardMember(`/meetings/${encodeURIComponent(id)}/edit`);
  if (!member) return null;
  const record = await boardMeetingsRepository.getMeeting(id);
  if (!record) notFound();
  const meeting = record.meeting;
  if (!canManageBoardMeetings(member) && !(meeting.status === "draft" && canPrepareBoardMeetings(member))) notFound();
  return (
    <Container className="max-w-5xl py-8 sm:py-12">
      <Badge tone="accent">Meeting administration</Badge>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl">Edit meeting</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)]">Update scheduling details. Calendar updates can be sent after the changes are saved.</p>
      <Surface className="mt-7 p-6 sm:p-8">
        <MeetingForm meeting={{
          id: meeting.id, title: meeting.title, description: meeting.description, type: meeting.type,
          status: meeting.status, startAt: meeting.startAt, endAt: meeting.endAt, timeZone: meeting.timeZone,
          location: meeting.location || null, virtualUrl: meeting.virtualUrl, version: meeting.version,
          minutesStatus: meeting.minutesStatus,
          quorumRequired: meeting.quorumRequired, quorumConfirmedAt: meeting.quorumConfirmedAt, quorumConfirmedBy: meeting.quorumConfirmedBy,
        }} />
      </Surface>
    </Container>
  );
}
