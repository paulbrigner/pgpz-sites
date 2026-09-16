import { notFound } from "next/navigation";
import { Container } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { agendaIdeasService } from "@/lib/agenda-ideas-service";
import { IdeaError } from "@/lib/agenda-ideas";
import { IdeaWorkspace } from "@/components/agenda-ideas/IdeaWorkspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda Idea", robots: { index: false, follow: false, nocache: true } };
export default async function AgendaIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireBoardMember(`/agenda-ideas/${encodeURIComponent(id)}`);
  if (!member) return null;
  try {
    const detail = await agendaIdeasService.detail(member, id);
    const choices = await agendaIdeasService.choices(member);
    return <Container className="max-w-5xl py-8 sm:py-12"><IdeaWorkspace key={`${id}-${detail.idea.version}`} detail={detail} choices={choices} /></Container>;
  } catch (error) {
    if (error instanceof IdeaError && [400, 404].includes(error.status)) notFound();
    throw error;
  }
}
