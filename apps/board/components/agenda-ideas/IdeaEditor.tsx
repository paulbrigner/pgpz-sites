"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { AgendaIdea, IdeaChoices } from "@/lib/agenda-ideas";

export const ideaField = "mt-1 block w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm focus:outline-2 focus:outline-[var(--focus)]";
export const ideaButton = "rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
export async function saveIdea(body: Record<string, unknown>) {
  const response = await fetchWithBoardStepUp("/api/agenda-ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to save. Refresh and try again.");
  return data as { id: string };
}
export function IdeaEditor({ choices, idea, onSaved }: { choices: IdeaChoices; idea?: AgendaIdea; onSaved?: () => void }) {
  const router = useRouter();
  const id = useRef<string | null>(idea?.id || null);
  const [documentSearch, setDocumentSearch] = useState("");
  const query = documentSearch.trim().toLocaleLowerCase();
  const matchesDocument = (title: string) => title.toLocaleLowerCase().includes(query);
  const matchingDocuments = choices.documents.filter((document) => matchesDocument(document.title));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    const form = new FormData(event.currentTarget);
    id.current ||= crypto.randomUUID();
    try {
      const result = await saveIdea({ action: idea ? "edit" : "create", id: id.current, expectedVersion: idea?.version,
        title: form.get("title"), description: form.get("description"), presenter: form.get("presenter"), preferredMeetingId: form.get("preferredMeetingId"), documentIds: form.getAll("documentIds") });
      if (idea) { onSaved?.(); router.refresh(); } else router.push(`/agenda-ideas/${encodeURIComponent(result.id)}`);
    } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-7">
    <label className="block text-sm font-semibold">Title<input name="title" required maxLength={200} defaultValue={idea?.title} className={ideaField} /></label>
    <label className="block text-sm font-semibold">What should the Board consider, and why?<textarea name="description" required maxLength={10000} rows={6} defaultValue={idea?.description} className={ideaField} /></label>
    <label className="block text-sm font-semibold">Preferred meeting<select name="preferredMeetingId" defaultValue={choices.meetings.some((m) => m.id === idea?.preferredMeetingId) ? idea?.preferredMeetingId || "" : ""} className={ideaField}><option value="">Future meeting</option>{choices.meetings.map((m) => <option key={m.id} value={m.id}>{m.title} · {new Date(m.startAt).toLocaleDateString("en-US", { timeZone: m.timeZone })}</option>)}</select></label>
    <label className="block text-sm font-semibold">Proposed presenter (optional)<input name="presenter" maxLength={200} defaultValue={idea?.presenter} className={ideaField} /></label>
    <fieldset>
      <legend className="text-sm font-semibold">Supporting library documents (optional, up to 10)</legend>
      {choices.documents.length > 0 && <label className="mt-2 block text-sm font-semibold">Search documents
        <input type="search" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Type to search document titles…" className={ideaField} />
      </label>}
      <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
        {choices.documents.map((document) => <label key={document.id} hidden={!matchesDocument(document.title)} className={matchesDocument(document.title) ? "flex items-start gap-2 text-sm" : "hidden"}>
          <input type="checkbox" name="documentIds" value={document.id} defaultChecked={idea?.documentIds.includes(document.id)} className="mt-1" />
          <span className="min-w-0 break-words">{document.title}</span>
        </label>)}
        {!choices.documents.length && <p className="text-sm text-[var(--muted)]">No active library documents available.</p>}
        {choices.documents.length > 0 && !matchingDocuments.length && <p role="status" className="text-sm text-[var(--muted)]">No documents match your search.</p>}
      </div>
      {query && <p className="mt-2 text-xs text-[var(--muted)]">Selected documents remain selected when filtered out.</p>}
    </fieldset>
    {idea?.scheduledMeetingId && <p className="text-sm text-[var(--muted)]">Changes here will not change the meeting agenda.</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error} <button type="button" onClick={() => router.refresh()} className="underline">Refresh</button></p>}
    <button disabled={pending} className={ideaButton}>{pending ? "Saving…" : idea ? "Save idea" : "Submit idea"}</button>
  </form>;
}
