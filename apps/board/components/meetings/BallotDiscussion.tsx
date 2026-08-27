"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageSquare, Pencil, RefreshCw, Reply, Send } from "lucide-react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { AsyncBallotView, DiscussionMessageView } from "./types";

const fieldClass = "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]";

function displayTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone,
  }).format(new Date(value));
}

function MessageByline({ message, timeZone }: { message: DiscussionMessageView; timeZone: string }) {
  return (
    <p className="text-xs leading-5 text-[var(--muted)]">
      <span className="font-semibold text-[var(--foreground)]">{message.authorName}</span>
      <span> · {message.authorEmail} · {displayTime(message.createdAt, timeZone)}</span>
      {message.editedAt ? <span> · Edited</span> : null}
    </p>
  );
}

export function BallotDiscussion({
  meetingId,
  ballot,
  canDiscuss,
  timeZone,
}: {
  meetingId: string;
  ballot: AsyncBallotView;
  canDiscuss: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const ids = new Set(ballot.discussionMessages.map((message) => message.id));
  const roots = ballot.discussionMessages.filter((message) => !message.replyToMessageId || !ids.has(message.replyToMessageId));
  const discussionOpen = ballot.effectiveStatus === "open";

  async function save(event: FormEvent<HTMLFormElement>, body: Record<string, unknown>, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setNotice(null);
    try {
      const response = await fetchWithBoardStepUp(`/api/meetings/${encodeURIComponent(meetingId)}/discussions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ballotId: ballot.id, body: String(data.get("body") || "") }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The discussion message could not be saved.");
      form.reset();
      setReplyingTo(null);
      setEditing(null);
      setNotice(success);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The discussion message could not be saved.");
    } finally {
      setPending(false);
    }
  }

  function renderMessage(message: DiscussionMessageView, reply = false) {
    return (
      <article key={message.id} className={`${reply ? "ml-5 border-l-2 border-[var(--border)] pl-4 sm:ml-8" : ""} rounded-xl bg-white py-3`}>
        <MessageByline message={message} timeZone={timeZone} />
        {editing === message.id ? (
          <form className="mt-2" onSubmit={(event) => void save(event, { action: "editMessage", messageId: message.id, expectedUpdatedAt: message.updatedAt }, "Your edit was retained.")}>
            <label className="sr-only" htmlFor={`edit-${message.id}`}>Edit discussion message</label>
            <textarea id={`edit-${message.id}`} name="body" required maxLength={4000} rows={3} defaultValue={message.body} className={fieldClass} />
            <div className="mt-2 flex gap-2">
              <button type="submit" disabled={pending} className="rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Save edit</button>
              <button type="button" disabled={pending} onClick={() => setEditing(null)} className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold">Cancel</button>
            </div>
          </form>
        ) : <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{message.body}</p>}
        {discussionOpen && canDiscuss && editing !== message.id ? (
          <div className="mt-2 flex gap-3">
            {!reply ? <button type="button" onClick={() => { setReplyingTo(replyingTo === message.id ? null : message.id); setEditing(null); }} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)]"><Reply className="h-3.5 w-3.5" aria-hidden="true" />Reply</button> : null}
            {message.canEdit ? <button type="button" onClick={() => { setEditing(message.id); setReplyingTo(null); }} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)]"><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</button> : null}
          </div>
        ) : null}
        {replyingTo === message.id ? (
          <form className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3" onSubmit={(event) => void save(event, { action: "createMessage", replyToMessageId: message.id }, "Your reply was retained.")}>
            <label className="text-xs font-semibold" htmlFor={`reply-${message.id}`}>Reply to {message.authorName}</label>
            <textarea id={`reply-${message.id}`} name="body" required maxLength={4000} rows={3} autoFocus className={fieldClass} />
            <div className="mt-2 flex gap-2">
              <button type="submit" disabled={pending} className="inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"><Send className="h-3.5 w-3.5" aria-hidden="true" />Post reply</button>
              <button type="button" disabled={pending} onClick={() => setReplyingTo(null)} className="rounded-full border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-semibold">Cancel</button>
            </div>
          </form>
        ) : null}
      </article>
    );
  }

  if (ballot.effectiveStatus === "draft") return null;

  return (
    <section className="mt-5 border-t border-[var(--border)] pt-5" aria-labelledby={`discussion-${ballot.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
          <h4 id={`discussion-${ballot.id}`} className="text-sm font-semibold text-[var(--foreground)]">Discussion</h4>
          <span className="text-xs font-semibold text-[var(--muted)]">{ballot.discussionMessages.length}</span>
        </div>
        <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh</button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Messages and edits are retained as governance records. Discussion is separate from the private ballot.</p>

      {roots.length ? (
        <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] px-4">
          {roots.map((root) => (
            <div key={root.id} className="py-1">
              {renderMessage(root)}
              {ballot.discussionMessages.filter((message) => message.replyToMessageId === root.id).map((reply) => renderMessage(reply, true))}
            </div>
          ))}
        </div>
      ) : <p className="mt-3 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">No discussion messages yet.</p>}

      {discussionOpen && canDiscuss ? (
        <form className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3" onSubmit={(event) => void save(event, { action: "createMessage" }, "Your message was retained.")}>
          <label className="text-xs font-semibold" htmlFor={`new-message-${ballot.id}`}>Add to the discussion</label>
          <textarea id={`new-message-${ballot.id}`} name="body" required maxLength={4000} rows={3} className={fieldClass} />
          <button type="submit" disabled={pending} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
            {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}Post message
          </button>
        </form>
      ) : discussionOpen ? <p className="mt-3 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--muted)]">Your role has read-only access to this discussion.</p>
        : <p className="mt-3 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--muted)]">{ballot.effectiveStatus === "scheduled" ? "Discussion opens with the voting window." : "Discussion is closed and preserved with the meeting record."}</p>}
      {notice ? <p role="status" className="mt-3 text-xs font-semibold text-[var(--foreground)]">{notice}</p> : null}
    </section>
  );
}
