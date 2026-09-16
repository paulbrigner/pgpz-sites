import Link from "next/link";
import { Container } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { agendaIdeasService } from "@/lib/agenda-ideas-service";
import { IdeaEditor } from "@/components/agenda-ideas/IdeaEditor";
export const dynamic = "force-dynamic";
export const metadata = { title: "Suggest an Agenda Idea", robots: { index: false, follow: false, nocache: true } };
export default async function NewAgendaIdeaPage() {
  const member = await requireBoardMember("/agenda-ideas/new");
  if (!member) return null;
  const choices = await agendaIdeasService.choices(member);
  return <Container className="max-w-3xl py-8 sm:py-12"><Link href="/agenda-ideas" className="text-sm font-semibold underline">Agenda ideas</Link><h1 className="mt-4 text-3xl font-semibold">Suggest an idea</h1><p className="mt-3 text-sm text-[var(--muted)]">Your idea and its discussion will be visible to all active Board portal users. Adding an idea does not place it on an agenda or approve an action.</p><IdeaEditor choices={choices} /></Container>;
}
