"use client";

import { useRef, useState } from "react";
import { REVIEW_REPLY_MAX_LENGTH } from "@/lib/resolution-reviews";
import type { ReviewThreadView } from "./types";

export function ReviewReplies({ thread, canReply, timeZone, ballotId, contentHash, pending, onPost }: {
  thread: ReviewThreadView; canReply: boolean; timeZone: string; ballotId: string; contentHash: string;
  pending: boolean; onPost: (body: Record<string, unknown>, success: string) => Promise<boolean>;
}) {
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const name = thread.submission.name;
  const stamp = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
  const target = thread.replies.find((reply) => reply.id === replyTo);
  function compose(id: string | null) {
    setReplyTo(id); setComposing(true);
    requestAnimationFrame(() => input.current?.focus());
  }
  const renderReply = (reply: ReviewThreadView["replies"][number]) => <article id={`review-reply-${reply.id}`} className="min-w-0 rounded-xl border border-[var(--border)] bg-white p-3 text-sm">
    <p className="text-xs [overflow-wrap:anywhere]"><strong>{reply.authorName}</strong> · {stamp(reply.createdAt)}</p>
    <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{reply.body}</p>
    {canReply && <button type="button" disabled={pending} className="mt-2 text-xs font-semibold underline disabled:opacity-50" onClick={() => compose(reply.id)}>Reply to {reply.authorName}</button>}
  </article>;
  return <details className="mt-3" id={`review-thread-${thread.submission.id}`}>
    <summary className="cursor-pointer rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">{canReply ? "Reply / Discuss" : "Replies"} ({thread.replies.length}) · {name}</summary>
    <div className="mt-3 min-w-0 rounded-xl bg-[var(--surface-muted)] p-3 sm:p-4">
      <p className="text-xs text-[var(--muted)]">Directors only. Replies are retained and do not change anyone&apos;s assessment or readiness. Use Executive Session for more restricted deliberations.</p>
      <div className="mt-3 grid gap-3">
        {thread.replies.filter((reply) => !reply.replyToMessageId).map((root) => <div key={root.id}>
          {renderReply(root)}
          <div className="ml-3 mt-2 grid gap-2 border-l-2 border-[var(--border)] pl-3 sm:ml-5">{thread.replies.filter((reply) => reply.replyToMessageId === root.id).map((reply) => <div key={reply.id}>{renderReply(reply)}</div>)}</div>
        </div>)}
      </div>
      {!thread.replies.length && <p className="mt-3 text-sm">No replies yet.</p>}
      {canReply ? <>
        <button type="button" disabled={pending} onClick={() => compose(null)} className="mt-3 text-sm font-semibold underline disabled:opacity-50">Reply to assessment</button>
        <form hidden={!composing} className="mt-3 grid gap-3" onSubmit={async (event) => {
          event.preventDefault(); const form = event.currentTarget;
          const saved = await onPost({ action: "postReviewReply", ballotId, roundId: thread.roundId, contentHash, submissionId: thread.submission.id, replyToMessageId: replyTo, body: new FormData(form).get("body") }, "Your reply was saved. Review readiness is unchanged.");
          if (saved) { form.reset(); setComposing(false); setReplyTo(null); }
        }}>
          <label htmlFor={`review-reply-body-${thread.submission.id}`} className="text-sm font-semibold">{target ? `Reply to ${target.authorName}` : `Reply to ${name}'s assessment`}</label>
          <textarea ref={input} id={`review-reply-body-${thread.submission.id}`} name="body" required maxLength={REVIEW_REPLY_MAX_LENGTH} rows={4} className="w-full min-w-0 rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm" />
          <p className="text-xs text-[var(--muted)]">The director you answer receives an email link. Assessment and reply text stay in the Board portal. Replies cannot be edited or deleted; add a correction if needed.</p>
          <div className="flex flex-wrap gap-3"><button disabled={pending} className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Post reply</button><button type="button" disabled={pending} onClick={() => setComposing(false)} className="text-sm font-semibold underline">Cancel</button></div>
        </form>
      </> : <p className="mt-3 text-xs text-[var(--muted)]">This assessment thread is read-only. Earlier replies remain retained.</p>}
    </div>
  </details>;
}
