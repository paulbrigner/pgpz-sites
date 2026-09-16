"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ideaDiscussionOpen, ideaStatusLabel, type IdeaChoices, type IdeaDetail, type IdeaMessage } from "@/lib/agenda-ideas";
import { IdeaEditor, ideaButton, ideaField, saveIdea } from "./IdeaEditor";

const time = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
const panel = "rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-7";
export function IdeaWorkspace({ detail, choices }: { detail: IdeaDetail; choices: IdeaChoices }) {
  const { idea, messages, viewerAccessId } = detail;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingIdea, setEditingIdea] = useState(false);
  const [editingMessage, setEditingMessage] = useState<IdeaMessage | null>(null);
  const [reply, setReply] = useState<IdeaMessage | null>(null);
  const messageId = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const open = ideaDiscussionOpen(idea);
  const own = idea.authorAccessId === viewerAccessId;
  useEffect(() => {
    // A read marker acknowledges only the displayed version, never newer posts.
    void fetch("/api/agenda-ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", id: idea.id, expectedVersion: idea.version }) }).catch(() => {});
  }, [idea.id, idea.version]);
  async function submit(event: FormEvent<HTMLFormElement>, action: string, extra: Record<string, unknown> = {}) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setPending(true); setError(null);
    try {
      await saveIdea({ ...data, ...extra, action, id: idea.id, expectedVersion: idea.version });
      router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  function comment(message: IdeaMessage) {
    return <article key={message.id} id={`comment-${message.id}`} className="min-w-0 rounded-xl border border-[var(--border)] p-4">
      <p className="text-sm font-semibold">{message.authorName}<span className="font-normal text-[var(--muted)]"> · {time(message.createdAt)} ET{message.editedAt ? " · Edited" : ""}</span></p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p>
      {open && <div className="mt-3 flex gap-4 text-sm font-semibold text-[var(--primary)]">
        <button type="button" onClick={() => { setReply(message); setEditingMessage(null); formRef.current?.reset(); formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Reply<span className="sr-only"> to {message.authorName}</span></button>
        {message.authorAccessId === viewerAccessId && <button type="button" onClick={() => { setEditingMessage(message); setReply(null); formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Edit<span className="sr-only"> comment by {message.authorName}</span></button>}
      </div>}
    </article>;
  }
  return <>
    <Link href="/agenda-ideas" className="text-sm font-semibold underline">All agenda ideas</Link>
    <div className="mt-5 flex flex-wrap items-center gap-3"><span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-sm font-semibold">{ideaStatusLabel(idea.status)}</span><button type="button" onClick={() => router.refresh()} className="text-sm font-semibold underline">Refresh activity</button></div>
    <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{idea.title}</h1>
    <p className="mt-3 text-sm text-[var(--muted)]">Suggested by {idea.authorName} · {time(idea.createdAt)} ET{idea.editedAt ? " · Edited" : ""}</p>
    <p className="mt-4 rounded-xl border border-[var(--border)] p-4 text-sm">Visible to all active Board portal users, including Board Support. Discussion does not approve a Board action.</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" onClick={() => router.refresh()} className="underline">Refresh</button></p>}
    <div className="mt-6 space-y-6">
      <section className={panel} aria-label="Idea details">
        <p className="whitespace-pre-wrap break-words leading-7 [overflow-wrap:anywhere]">{idea.description}</p>
        <dl className="mt-5 space-y-2 text-sm"><div><dt className="inline font-semibold">Preferred meeting: </dt><dd className="inline">{detail.preferredMeeting ? <Link className="underline" href={`/meetings/${encodeURIComponent(detail.preferredMeeting.id)}`}>{detail.preferredMeeting.title}</Link> : "Future meeting"}</dd></div>{idea.presenter && <div><dt className="inline font-semibold">Proposed presenter: </dt><dd className="inline">{idea.presenter}</dd></div>}</dl>
        {!!detail.documents.length && <div className="mt-5"><h2 className="text-sm font-semibold">Supporting library documents</h2><ul className="mt-2 space-y-2">{detail.documents.map((d) => <li key={d.id}><Link className="break-words text-sm text-[var(--primary)] underline" href={`/documents?document=${encodeURIComponent(d.id)}`}>{d.title}</Link></li>)}</ul></div>}
        {idea.documentIds.length > detail.documents.length && <p className="mt-3 text-sm text-[var(--muted)]">Some linked documents are no longer available in the active library.</p>}
        {idea.reason && <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-muted)] p-3 text-sm"><strong>{ideaStatusLabel(idea.status)}: </strong>{idea.reason}</p>}
        {detail.scheduledMeeting && <p className="mt-4 text-sm"><Link href={`/meetings/${encodeURIComponent(detail.scheduledMeeting.id)}#agenda-${encodeURIComponent(idea.agendaItemId || "")}`} className="font-semibold underline">View agenda placement: {detail.scheduledMeeting.title}</Link>{(!detail.scheduledMeeting.agendaItemActive || detail.scheduledMeeting.status === "cancelled") && <span className="mt-2 block text-[var(--muted)]">This placement is retained as history; the agenda item was removed or the meeting was cancelled.</span>}</p>}
        {own && open && <button type="button" onClick={() => setEditingIdea(!editingIdea)} className="mt-5 text-sm font-semibold underline">{editingIdea ? "Cancel editing" : "Edit idea"}</button>}
        {editingIdea && <IdeaEditor idea={idea} choices={choices} onSaved={() => setEditingIdea(false)} />}
      </section>
      <section className={panel} aria-labelledby="idea-discussion"><h2 id="idea-discussion" className="text-xl font-semibold">Discussion <span className="text-sm font-normal text-[var(--muted)]">({messages.length})</span></h2>
        <div className="mt-4 space-y-4">{messages.filter((m) => !m.replyToId).map((m) => <div key={m.id} className="space-y-3">{comment(m)}{messages.filter((r) => r.replyToId === m.id).map((r) => <div key={r.id} className="ml-3 border-l-2 border-[var(--border)] pl-3 sm:ml-6">{comment(r)}</div>)}</div>)}</div>
        {!messages.length && <p className="mt-4 text-sm text-[var(--muted)]">No comments yet. Add a question or help develop this idea.</p>}
        {open ? <form ref={formRef} className="mt-5 space-y-3" onSubmit={(event) => { messageId.current ||= crypto.randomUUID(); void submit(event, editingMessage ? "editComment" : "comment", { messageId: editingMessage?.id || messageId.current, replyToId: reply?.id || null }); }}>
          <label className="block text-sm font-semibold">{editingMessage ? "Edit your comment" : reply ? `Reply to ${reply.authorName}` : "Add a comment"}<textarea key={editingMessage?.id || reply?.id || "new"} name="body" defaultValue={editingMessage?.body || ""} rows={4} required maxLength={10000} className={ideaField} /></label>
          <div className="flex flex-wrap gap-4"><button disabled={pending} className={ideaButton}>{pending ? "Saving…" : editingMessage ? "Save comment" : "Post comment"}</button>{(reply || editingMessage) && <button type="button" onClick={() => { setReply(null); setEditingMessage(null); }} className="text-sm font-semibold underline">Cancel</button>}</div>
        </form> : <p className="mt-4 text-sm text-[var(--muted)]">Discussion is closed. The retained conversation remains available.</p>}
      </section>
      {detail.canManage && <section className={panel} aria-labelledby="idea-management"><h2 id="idea-management" className="text-xl font-semibold">Manage idea</h2>
        {!idea.scheduledMeetingId && ["open", "deferred"].includes(idea.status) && <details className="mt-4"><summary className="cursor-pointer font-semibold">Add to a meeting agenda</summary><form className="mt-4 space-y-4" onSubmit={(event) => { const meetingId = new FormData(event.currentTarget).get("meetingId"); void submit(event, "schedule", { meetingVersion: choices.meetings.find((m) => m.id === meetingId)?.version }); }}>
          <p className="text-sm text-[var(--muted)]">Review the agenda text. This creates a discussion item linked to this idea; later idea edits will not rewrite the agenda.</p>
          <label className="block text-sm font-semibold">Meeting<select name="meetingId" required className={ideaField} defaultValue={choices.meetings.some((m) => m.id === idea.preferredMeetingId) ? idea.preferredMeetingId || "" : ""}><option value="">Select a published upcoming meeting</option>{choices.meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
          {!choices.meetings.length && <p className="text-sm text-[var(--muted)]">Publish an upcoming meeting first, then refresh this page.</p>}
          <label className="block text-sm font-semibold">Agenda title<input name="title" required maxLength={200} defaultValue={idea.title} className={ideaField} /></label>
          <label className="block text-sm font-semibold">Agenda description<textarea name="description" required maxLength={10000} defaultValue={idea.description} rows={4} className={ideaField} /></label>
          <label className="block text-sm font-semibold">Presenter<input name="presenter" maxLength={200} defaultValue={idea.presenter} className={ideaField} /></label>
          <label className="block text-sm font-semibold">Allotted minutes (optional)<input name="allottedMinutes" type="number" min={1} max={480} step={1} className={ideaField} /></label>
          <button className={ideaButton} disabled={pending || !choices.meetings.length}>Add to agenda</button>
        </form></details>}
        <details className="mt-5"><summary className="cursor-pointer font-semibold">Change status</summary><form className="mt-4 space-y-4" onSubmit={(e) => void submit(e, "status")}>
          <label className="block text-sm font-semibold">New status<select name="status" className={ideaField} defaultValue="closed">{!idea.scheduledMeetingId && <><option value="open">Open</option><option value="deferred">Deferred</option></>}<option value="closed">Closed</option></select></label>
          <label className="block text-sm font-semibold">Explanation<textarea name="reason" required maxLength={2000} rows={3} className={ideaField} /></label><button className={ideaButton} disabled={pending}>Update status</button>
        </form></details>
      </section>}
      {own && open && !idea.scheduledMeetingId && <details className={panel}><summary className="cursor-pointer text-sm font-semibold">Withdraw your suggestion</summary><form className="mt-4 space-y-4" onSubmit={(e) => void submit(e, "withdraw")}><p className="text-sm text-[var(--muted)]">The suggestion and discussion will remain in the record.</p><label className="block text-sm font-semibold">Explanation<textarea name="reason" required maxLength={2000} rows={3} className={ideaField} /></label><button disabled={pending} className={ideaButton}>Withdraw idea</button></form></details>}
      <details className={panel}><summary className="cursor-pointer font-semibold">Retained history ({detail.history.length})</summary><ol className="mt-4 space-y-4">{detail.history.map((revision) => <li key={revision.id} className="border-t border-[var(--border)] pt-4 text-sm"><p className="font-semibold">{revision.actorName} · {revision.action.replaceAll("_", " ")} · {time(revision.occurredAt)} ET</p><details className="mt-2"><summary className="cursor-pointer text-[var(--muted)]">View revision {revision.idea.version}</summary><p className="mt-2 break-words font-semibold">{revision.idea.title}</p><p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{revision.message?.body || revision.idea.description}</p><p className="mt-2 break-words">{ideaStatusLabel(revision.idea.status)}{revision.idea.reason && ` · ${revision.idea.reason}`}</p></details></li>)}</ol></details>
    </div>
  </>;
}
