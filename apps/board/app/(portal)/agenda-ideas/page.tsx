import Link from "next/link";
import { Container } from "@pgpz/ui";
import { requireBoardMember } from "@/lib/session";
import { agendaIdeasService } from "@/lib/agenda-ideas-service";
import { ideaStatusLabel } from "@/lib/agenda-ideas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda Ideas", robots: { index: false, follow: false, nocache: true } };
export default async function AgendaIdeasPage({ searchParams }: { searchParams?: Promise<{ cursor?: string }> }) {
  const member = await requireBoardMember("/agenda-ideas");
  if (!member) return null;
  const { ideas, cursor } = await agendaIdeasService.list(member, (await searchParams)?.cursor);
  return <Container className="max-w-5xl py-8 sm:py-12">
    <Link href="/meetings" className="text-sm font-semibold text-[var(--primary)] underline">Board meetings</Link>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4"><h1 className="text-4xl font-semibold tracking-tight">Agenda ideas</h1><Link href="/agenda-ideas/new" className="rounded-full bg-[var(--primary)] px-5 py-3 font-semibold text-white">Suggest an idea</Link></div>
    <p className="mt-3 text-[var(--muted)]">Suggest and develop topics for an upcoming Board meeting. Ideas can begin before a meeting is scheduled.</p>
    <p className="mt-4 rounded-xl border border-[var(--border)] bg-white p-4 text-sm">Visible to all active Board portal users, including Board Support. Use the restricted executive-session workflow for confidential matters.</p>
    <ul className="mt-6 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
      {ideas.map((idea) => <li key={idea.id}><Link href={`/agenda-ideas/${encodeURIComponent(idea.id)}`} className="block p-5 hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
        <div className="flex flex-wrap items-center gap-3"><span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{ideaStatusLabel(idea.status)}</span>{idea.unread && <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-ink)]">Unread activity</span>}</div>
        <h2 className="mt-2 break-words text-lg font-semibold">{idea.title}</h2><p className="mt-1 line-clamp-2 break-words text-sm text-[var(--muted)]">{idea.description}</p><p className="mt-3 text-xs text-[var(--muted)]">Suggested by {idea.authorName} · Updated {new Date(idea.updatedAt).toLocaleDateString("en-US", { timeZone: "America/New_York", dateStyle: "medium" })}</p>
      </Link></li>)}
    </ul>
    {!ideas.length && <p className="py-10 text-center text-[var(--muted)]">No ideas yet. Suggest a topic you would like the Board to consider.</p>}
    <nav aria-label="Idea pages" className="mt-5 flex gap-5 text-sm font-semibold text-[var(--primary)]">{(await searchParams)?.cursor && <Link href="/agenda-ideas" className="underline">Newest ideas</Link>}{cursor && <Link href={`/agenda-ideas?cursor=${encodeURIComponent(cursor)}`} className="underline">Older ideas</Link>}</nav>
  </Container>;
}
