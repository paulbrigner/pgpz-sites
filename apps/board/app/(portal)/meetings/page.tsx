import Link from "next/link";
import { Badge, Container } from "@pgpz/ui";
import { ShieldCheck } from "lucide-react";
import { MeetingList } from "@/components/meetings/MeetingList";
import type { MeetingSummaryView } from "@/components/meetings/types";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { canManageBoardMeetings, canPrepareBoardMeetings, requireBoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Board Meetings", robots: { index: false, follow: false, nocache: true } };

export default async function BoardMeetingsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await requireBoardMember("/meetings");
  if (!member) return null;
  const params = await searchParams;
  const rawView = Array.isArray(params?.view) ? params?.view[0] : params?.view;
  const scope = rawView === "past" ? "past" : "upcoming";
  const canManage = canManageBoardMeetings(member);
  const canPrepare = canPrepareBoardMeetings(member);
  const page = await boardMeetingsRepository.listMeetings({ scope, limit: 50 });
  const meetings: MeetingSummaryView[] = page.meetings
    .filter((meeting) => meeting.status !== "draft" || canManage || canPrepare)
    .map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      description: meeting.description,
      type: meeting.type,
      format: meeting.format,
      status: meeting.status,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      timeZone: meeting.timeZone,
      location: meeting.location || null,
      virtualUrl: meeting.virtualUrl,
      version: meeting.version,
      minutesStatus: meeting.minutesStatus,
      quorumRequired: meeting.quorumRequired, quorumConfirmedAt: meeting.quorumConfirmedAt, quorumConfirmedBy: meeting.quorumConfirmedBy,
    }));

  return (
    <Container className="max-w-6xl py-8 sm:py-12">
      <section className="max-w-3xl">
        <Badge tone="accent">Board calendar</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl">Board meetings</h1>
        <p className="mt-3 text-base leading-7 text-[var(--muted)]">Prepare for live meetings and asynchronous written resolutions, then review the Board&apos;s retained meeting records.</p>
      </section>
      <aside className="mt-5 flex max-w-3xl items-start gap-3 rounded-2xl border border-[var(--border)] bg-white/65 px-4 py-3 text-sm leading-6 text-[var(--muted)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
        <p>Meeting materials, decisions, votes, and minutes remain with their meeting record. <Link href="/governance-safeguards" className="font-semibold text-[var(--primary)] underline decoration-[var(--border-strong)] underline-offset-4">Learn about record safeguards</Link></p>
      </aside>
      <MeetingList meetings={meetings} scope={scope} canManage={canManage} canPrepare={canPrepare} />
    </Container>
  );
}
