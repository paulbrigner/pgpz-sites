"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { ExecutiveSession, ExecutiveMessage, ExecutiveMaterial } from "@/lib/executive-sessions";

const input = "mt-2 block w-full rounded-xl border border-[var(--border-strong)] bg-white p-3 text-sm";
const button = "rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const card = "rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-7";

export function ExecutiveSessionWorkspace({ session, messages, materials, canManage }: {
  session: ExecutiveSession; messages: ExecutiveMessage[];
  materials: Omit<ExecutiveMaterial, "objectKey">[]; canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const api = `/api/meetings/${encodeURIComponent(session.meetingId)}/executive-sessions/${encodeURIComponent(session.id)}`;
  const open = session.status === "open";

  async function mutate(action: string, payload: Record<string, unknown> = {}, form?: HTMLFormElement) {
    setPending(true); setFeedback("");
    try {
      const response = await fetchWithBoardStepUp(api, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedVersion: session.version, ...payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save this action.");
      form?.reset(); setPreview(null); setConfirmed(false);
      setFeedback(action === "publish" ? "Reviewed outcome published to the ordinary meeting." : "Private session record saved.");
      router.refresh();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to save this action."); }
    finally { setPending(false); }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const data = new FormData(form); data.set("expectedVersion", String(session.version));
    setPending(true); setFeedback("");
    try {
      const response = await fetchWithBoardStepUp(`${api}/materials`, { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to retain the file.");
      form.reset(); setFeedback("Private material retained."); router.refresh();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to retain the file."); }
    finally { setPending(false); }
  }

  return <div className="space-y-6">
    <Link href={`/meetings/${encodeURIComponent(session.meetingId)}`} className="text-sm font-semibold text-[var(--primary)] underline">Back to ordinary meeting</Link>
    <header className={`${card} border-l-4 border-l-[var(--primary)]`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Restricted executive session · {open ? "Open" : "Closed"}</p>
      <h1 className="mt-2 text-3xl font-semibold">{session.title}</h1>
      <p className="mt-4 whitespace-pre-wrap text-sm">{session.purpose}</p>
      <p className="mt-4 text-sm text-[var(--muted)]">Private deliberation only. No votes are cast or counted here. Formal decisions and any required consents must be recorded separately in the ordinary meeting.</p>
      <p className="mt-2 text-sm text-[var(--muted)]">Messages and files are retained without editing or deletion. Add a correction as a new message or material. Refresh to see other participants’ contributions.</p>
      <button type="button" onClick={() => router.refresh()} className="mt-3 text-sm font-semibold text-[var(--primary)] underline">Refresh session</button>
    </header>
    <section className={card} aria-labelledby="participants-heading">
      <h2 id="participants-heading" className="text-lg font-semibold">Admitted participants</h2>
      <ul className="mt-3 space-y-2 text-sm">{session.participants.map((p) => <li key={p.accessId}>{p.name || p.email} · {p.kind === "counsel" ? "Invited Legal Counsel" : "Director"}{p.accessId === session.facilitatorId ? " · Facilitator" : ""}</li>)}</ul>
      <p className="mt-3 text-sm text-[var(--muted)]">Access also requires a current active roster role. Staff and unselected directors cannot enter, including a Chair who is excluded. The participant list is fixed.</p>
    </section>
    <section className={card} aria-labelledby="materials-heading">
      <h2 id="materials-heading" className="text-lg font-semibold">Private materials</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">These files are available only inside this session. Library documents and ordinary meeting materials retain their broader audience.</p>
      {materials.length ? <ul className="mt-4 space-y-3">{materials.map((m) => <li key={m.id}>
        <a className="font-medium text-[var(--primary)] underline" href={`${api}/materials/${encodeURIComponent(m.id)}`}>{m.title}</a>
        <span className="ml-2 text-xs text-[var(--muted)]">{m.fileName} · {Math.ceil(m.byteLength / 1024)} KiB</span>
      </li>)}</ul> : <p className="mt-3 text-sm">No private materials yet.</p>}
      {canManage && open && <form onSubmit={upload} className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
        <label className="block text-sm font-medium">Material title<input required name="title" maxLength={200} className={input} /></label>
        <label className="block text-sm font-medium">Private file (up to 4 MiB)<input required type="file" name="file" accept=".pdf,.zip,.json,.txt,.md,.csv" className={input} /></label>
        <button disabled={pending} className={button}>Retain private material</button>
      </form>}
    </section>
    <section className={card} aria-labelledby="deliberation-heading">
      <h2 id="deliberation-heading" className="text-lg font-semibold">Restricted deliberation</h2>
      <ol className="mt-4 space-y-4">{messages.map((m) => <li key={m.id} className="rounded-xl bg-[var(--surface-muted)] p-4">
        <p className="text-sm font-semibold">{m.authorName} <time className="ml-2 text-xs font-normal" dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString()}</time></p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{m.body}</p>
      </li>)}</ol>
      {!messages.length && <p className="mt-3 text-sm">No contributions yet.</p>}
      {open ? <form className="mt-5 space-y-3" onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget;
        void mutate("message", { body: new FormData(form).get("body") }, form);
      }}>
        <label className="block text-sm font-medium">Add a private contribution<textarea name="body" required rows={5} maxLength={12000} className={input} /></label>
        <button disabled={pending} className={button}>Post to restricted session</button>
      </form> : <p className="mt-5 text-sm font-medium">Closed {session.closedAt ? new Date(session.closedAt).toLocaleString() : ""}. The private record is read-only.</p>}
    </section>
    {canManage && <section className={card} aria-labelledby="session-record-heading">
      <h2 id="session-record-heading" className="text-lg font-semibold">Session record</h2>
      {open ? <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void mutate("close"); }}>
        <p className="text-sm">Close after participants finish deliberating. Closure permanently prevents new messages and files. You can then prepare a separate outcome for the ordinary meeting.</p>
        <label className="flex items-start gap-3 text-sm"><input required type="checkbox" className="mt-1" />I am ready to close this session and retain its private record.</label>
        <button disabled={pending} className={button}>Close deliberation</button>
      </form> : session.publishedAt ? <p className="mt-3 text-sm">A reviewed outcome was published to the ordinary meeting. The private record remains restricted.</p> : <div className="mt-4 space-y-4">
        <p className="text-sm">Publication shares only the exact summary below with all active Board portal users, including the Executive Director, Board Support, and Legal Counsel. It does not release this session’s title, purpose, participant list, discussion, or files.</p>
        <label className="block text-sm font-medium">Reviewed outcome for the ordinary meeting<textarea value={summary} onChange={(event) => { setSummary(event.target.value); setPreview(null); setConfirmed(false); }} maxLength={12000} rows={5} className={input} /></label>
        <button type="button" className={button} disabled={pending || !summary.trim()} onClick={() => { setPreview(summary.trim()); setConfirmed(false); }}>Preview publication</button>
        {preview !== null && <div className="space-y-4 rounded-xl border-2 border-[var(--primary)] p-4">
          <h3 className="font-semibold">All Board portal users will see:</h3><p className="whitespace-pre-wrap break-words text-sm">{preview}</p>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />I reviewed this exact text and authorize sharing it with all active Board portal users. Publication is permanent.</label>
          <button type="button" className={button} disabled={pending || !confirmed} onClick={() => void mutate("publish", { summary: preview, confirmPublication: true })}>Publish reviewed outcome</button>
        </div>}
      </div>}
    </section>}
    {feedback && <p role="status" className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm">{feedback}</p>}
  </div>;
}
