"use client";

import { REVIEW_ATTESTATION, reviewProgress } from "@/lib/resolution-reviews";
import type { AsyncBallotView, MeetingSummaryView } from "./types";
import { useRouter } from "next/navigation";

const field = "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm";

export function ResolutionReviewPanel({ ballot, meeting, pending, onPost }: {
  ballot: AsyncBallotView; meeting: MeetingSummaryView; pending: boolean;
  onPost: (body: Record<string, unknown>, success: string) => Promise<boolean>;
}) {
  const router = useRouter();
  const review = ballot.review;
  if (!review) return null;
  const round = review.round, progress = reviewProgress(round);
  const own = round?.submissions.find((entry) => entry.accessId === review.viewerAccessId);
  const canSubmit = !!round && round.reviewers.some((person) => person.userId === review.viewerAccessId) && !review.rosterChanged && ballot.effectiveStatus === "draft" && ["scheduled", "materials-published"].includes(meeting.status) && Date.now() < Date.parse(meeting.endAt);
  const stamp = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: meeting.timeZone }).format(new Date(value));
  const record = `/api/meetings/${encodeURIComponent(meeting.id)}/ballots/${encodeURIComponent(ballot.id)}/review-record`;
  return <section aria-label={`Required review for ${ballot.title}`} className="mt-4 rounded-xl border border-[var(--border-strong)] bg-white p-4">
    <h4 className="font-semibold">Review before consent</h4>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{review.instructions}</p>
    <p className="mt-2 text-xs text-[var(--muted)]">Assessments and the review record are visible only to active directors. Use Executive Session for sensitive conflict details or deliberations requiring a narrower audience. Completing review does not adopt this resolution.</p>
    {!round ? <p className="mt-3 text-sm font-semibold">{ballot.effectiveStatus === "cancelled" ? "This resolution was cancelled. Earlier reviews remain available in the retained record." : review.everStarted ? "The materials changed. Earlier reviews remain available; the Chair must restart review before consents can open." : "The Chair must start review of the saved document versions before consents can open."}</p> : <>
      <p className="mt-3 text-sm font-semibold">{progress.ready} of {progress.total} reviews ready{progress.attention ? ` · ${progress.attention} requiring follow-up` : ""}{progress.pending ? ` · ${progress.pending} pending` : ""}</p>
      {review.rosterChanged && <p className="mt-2 text-sm font-semibold text-amber-900">The director roster changed. The Chair must restart review for the current board. Previous reviews remain retained.</p>}
      <ul className="mt-3 grid gap-3">
        {round.reviewers.map((person) => {
          const entry = round.submissions.find((submission) => submission.accessId === person.userId);
          return <li key={person.userId} className="min-w-0 border-t border-[var(--border)] pt-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><strong className="break-words">{person.name}</strong><span>{!entry ? "Review pending" : entry.outcome === "ready" && entry.conflict === "none" ? "Ready for consent" : "Follow-up required"}</span></div>
            {entry && <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold">Assessment · reviewed {entry.reviewedOn}</summary>
              <p className="mt-2 whitespace-pre-wrap break-words">{entry.assessment}</p>
              <p className="mt-2 text-xs">Conflict review: {entry.conflict === "none" ? "No conflict requiring recusal reported" : "Conflict or recusal requires attention"}. Recorded {stamp(entry.recordedAt)}.</p>
            </details>}
          </li>;
        })}
      </ul>
      {round.finalization && <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm"><p className="font-semibold">Findings presented for adoption</p><p className="mt-2 whitespace-pre-wrap break-words">{round.finalization.findings}</p><p className="mt-2 text-xs">Record finalized by {round.finalization.confirmedBy} on {stamp(round.finalization.confirmedAt)}. Adoption is recorded separately through signed consents.</p></div>}
    </>}
    {(round || review.everStarted) && <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold"><button type="button" className="underline" disabled={pending} onClick={() => router.refresh()}>Refresh reviews</button><a href={`${record}?format=pdf`} className="underline">Download review packet</a><a href={record} target="_blank" rel="noreferrer" className="underline">View full review record</a></div>}
    {canSubmit && <details key={`${round!.id}:${own?.id || "new"}`} className="mt-4" open={!own}><summary className="cursor-pointer text-sm font-semibold">{own ? "Update my review" : "Record my review"}</summary>
      <form className="mt-3 grid gap-3" onSubmit={async (event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        await onPost({ action: "submitReview", ballotId: ballot.id, roundId: round!.id, contentHash: round!.contentHash, reviewedOn: data.get("reviewedOn"), outcome: data.get("outcome"), conflict: data.get("conflict"), assessment: data.get("assessment"), attested: data.get("attested") === "on" }, "Your dated review was recorded. This is not a signed consent.");
      }}>
        <label className="text-sm font-semibold">Date you completed this review<input type="date" name="reviewedOn" required defaultValue={own?.reviewedOn} className={field} /></label>
        <label className="text-sm font-semibold">Conflict review<select name="conflict" required defaultValue={own?.conflict || ""} className={field}><option value="" disabled>Select your assessment</option><option value="none">No conflict requiring my recusal</option><option value="needs-attention">A conflict or possible recusal needs attention</option></select></label>
        <label className="text-sm font-semibold">Review outcome<select name="outcome" required defaultValue={own?.outcome || ""} className={field}><option value="" disabled>Select your assessment</option><option value="ready">My review is complete; ready for consent</option><option value="needs-attention">Changes or further review are needed</option></select></label>
        <label className="text-sm font-semibold">Your assessment and basis<textarea name="assessment" required maxLength={2000} rows={4} defaultValue={own?.assessment} className={field} /><span className="mt-1 block text-xs font-normal">Briefly explain your assessment using the requested review criteria. Keep sensitive conflict details in Executive Session.</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" required name="attested" className="mt-1" /><span>{REVIEW_ATTESTATION}</span></label>
        <button disabled={pending} className="w-fit rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{own ? "Record updated review" : "Record my review"}</button>
      </form>
    </details>}
  </section>;
}
