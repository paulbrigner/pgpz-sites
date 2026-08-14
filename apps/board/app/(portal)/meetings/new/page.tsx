import { notFound } from "next/navigation";
import { Badge, Container, Surface } from "@pgpz/ui";
import { MeetingForm } from "@/components/meetings/MeetingForm";
import { canPrepareBoardMeetings, requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule Board Meeting", robots: { index: false, follow: false, nocache: true } };

export default async function NewBoardMeetingPage() {
  const member = await requireBoardMember("/meetings/new");
  if (!member) return null;
  if (!canPrepareBoardMeetings(member)) notFound();
  return (
    <Container className="max-w-5xl py-8 sm:py-12">
      <Badge tone="accent">Meeting administration</Badge>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl">Schedule a meeting</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)]">Create a private draft first. You can prepare the agenda and materials before publishing it to the Board.</p>
      <Surface className="mt-7 p-6 sm:p-8"><MeetingForm /></Surface>
    </Container>
  );
}
