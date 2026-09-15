"use client";

import { FormEvent, useEffect, useState } from "react";
import { ChevronDown, Search, RefreshCw } from "lucide-react";
import { resolutionTask, type ResolutionFilter } from "./resolution-task";
import { useRouter } from "next/navigation";
import { Surface } from "@pgpz/ui";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import { CONSENT_STATEMENT, WITHDRAWAL_STATEMENT, ROSTER_CONFIRMATION } from "@/lib/written-consents";
import type { AsyncBallotView, MeetingDetailView, MeetingSummaryView } from "./types";
import { BallotDiscussion } from "./BallotDiscussion";
import { ResolutionDraftForm } from "./ResolutionDraftForm";
import { ResolutionReviewPanel } from "./ResolutionReviewPanel";
import { reviewProgress } from "@/lib/resolution-reviews";
import { reviewThreadId } from "@/lib/resolution-review-links";

const field = "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm";
const button = "w-fit rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "w-fit rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";

export function AsyncBallots({ meeting, ballots, canManage, canDiscuss, documentChoices = [], directorRoster = null, canCoordinateReviews = false }: {
  meeting: MeetingSummaryView; ballots: AsyncBallotView[]; canManage: boolean; canDiscuss: boolean;
  documentChoices?: MeetingDetailView["consentDocumentChoices"]; directorRoster?: MeetingDetailView["directorRoster"];
  canCoordinateReviews?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResolutionFilter>("all");
  const tasks = ballots.map((ballot) => resolutionTask(ballot, meeting));
  const personal = ballots.some((ballot) => ballot.viewerEligible || ballot.review?.viewerAccessId || ballot.consent?.viewerReceipt);
  const counts = { all: ballots.length, attention: 0, waiting: 0, complete: 0, reference: 0 };
  tasks.forEach((task) => counts[task.bucket]++);
  const matches = ballots.map((ballot, index) => (filter === "all" || tasks[index].bucket === filter) && `${ballot.title} ${ballot.motion} ${ballot.attachments?.map((doc) => doc.title).join(" ") || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const ballotIds = ballots.map((ballot) => ballot.id).join(",");
  const reviewThreadIds = ballots.flatMap((ballot) => ballot.review?.threads?.map((thread) => thread.submission.id) || []).join(",");
  useEffect(() => {
    function openLinkedResolution() {
      const queryThread = reviewThreadId(new URLSearchParams(window.location.search).get("reviewThread"));
      const id = window.location.hash.slice(1) || (queryThread ? `review-thread-${queryThread}` : "");
      const target = document.getElementById(id);
      const linkedBallotId = id.startsWith("review-thread-") ? target?.closest("[data-resolution-id]")?.getAttribute("data-resolution-id") : id.slice(7);
      if (!linkedBallotId || !ballotIds.split(",").includes(linkedBallotId) || (!id.startsWith("ballot-") && !id.startsWith("review-thread-"))) return;
      setFilter("all"); setQuery(""); setExpanded((previous) => ({ ...previous, [linkedBallotId]: true }));
      requestAnimationFrame(() => {
        if (id.startsWith("review-thread-")) {
          for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) {
            if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
          }
          target?.querySelector("summary")?.focus({ preventScroll: true });
        } else document.getElementById(`${id}-toggle`)?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: "start" });
      });
    }
    openLinkedResolution();
    window.addEventListener("hashchange", openLinkedResolution);
    window.addEventListener("popstate", openLinkedResolution);
    return () => { window.removeEventListener("hashchange", openLinkedResolution); window.removeEventListener("popstate", openLinkedResolution); };
  }, [ballotIds, reviewThreadIds]);
  const active = ["draft", "scheduled", "materials-published"].includes(meeting.status);
  async function post(body: Record<string, unknown>, success: string, communications = false) {
    setPending(true); setMessage("");
    try {
      const response = await fetchWithBoardStepUp(`/api/meetings/${encodeURIComponent(meeting.id)}/${communications ? "communications" : "ballots"}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: meeting.version, ...body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The record could not be saved.");
      const notice = body.action === "postReviewReply" ? result.replyNotice === "sent" ? " Email notification sent." : result.replyNotice === "skipped" ? " No email was sent because this was a self-reply or the recipient no longer has matching active director access." : " Your reply is saved, but email delivery could not be confirmed. Check with the director before sending another notice." : "";
      setMessage(result.adopted ? "All directors have delivered consent. This resolution is now adopted." : success + notice);
      router.refresh(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save. Refresh to check your receipt before retrying."); return false; }
    finally { setPending(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>, ballot?: AsyncBallotView) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    const selections = data.getAll("document").filter(Boolean).map((value) => JSON.parse(String(value)));
    const attachments = selections.map(({ documentId, versionId, description }) => ({ documentId, versionId, ...(description ? { description } : {}) }));
    const adoption = { targets: selections.filter((item) => item.treatment === "adopt").map(({ documentId, versionId }) => ({ documentId, versionId })), effectiveTerms: String(data.get("effectiveTerms") || "") };
    const saved = await post({ action: "saveBallot", ...(ballot ? { ballotId: ballot.id } : {}), title: data.get("title"), motion: data.get("motion"), attachments, adoption, ...(canCoordinateReviews ? { review: data.get("reviewRequired") === "true" ? { instructions: data.get("reviewInstructions") } : null, restartReview: data.get("restartReview") === "on" } : {}) }, "Draft resolution saved. Review its exact document versions and adoption targets before opening collection.");
    return saved;
  }
  function draftForm(ballot?: AsyncBallotView) {
    return <ResolutionDraftForm ballot={ballot} documentChoices={documentChoices} pending={pending} canCoordinateReviews={canCoordinateReviews} onSave={(event) => save(event, ballot)} />;
  }

  return <Surface id="resolutions" className="min-w-0 scroll-mt-28 p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{personal ? "Your resolution checklist" : "Resolutions"}</h2><p className="mt-1 text-sm text-[var(--muted)]">Open an item to read, discuss, and take your next step.</p></div>
      <button type="button" className={`${secondary} inline-flex items-center gap-2 text-xs`} onClick={() => router.refresh()}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh status</button>
    </div>
    {personal && <p className="mt-4 rounded-xl bg-[var(--primary-soft)] px-4 py-3 text-sm"><strong>{counts.attention} {counts.attention === 1 ? "item needs" : "items need"} your attention</strong><span className="text-[var(--muted)]"> · Review and consent are separate steps.</span></p>}
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-[var(--muted)]">How unanimous written consent works</summary>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">This is action without a meeting. Each resolution is adopted when every director has signed and delivered consent to that exact action. A majority, an abstention, a recusal, or silence cannot adopt it. Consent to using this process does not approve any resolution.</p>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">If you cannot approve an item, discuss it here and leave it unsigned. Resolve conflicts through the Chair or counsel; this workflow cannot exclude a director to obtain unanimity. An amended resolution needs fresh consents from everyone.</p>
    </details>
    {!!ballots.length && <div className="mt-5 grid gap-3">
      <label className="relative block"><span className="sr-only">Search resolutions</span><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-[var(--muted)]" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resolutions or documents" className="w-full rounded-xl border border-[var(--border-strong)] bg-white py-2.5 pl-10 pr-3 text-sm" /></label>
      <div role="group" aria-label="Filter resolutions" className="flex flex-wrap gap-2">
        {([ ["all", "All"], ...(personal ? [["attention", "Needs my attention"], ["complete", "My consent delivered"]] : []), ["waiting", "Waiting"], ["reference", "Reference"] ] as [ResolutionFilter, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${filter === value ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white text-[var(--muted)]"}`}>{label} ({counts[value]})</button>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]"><p role="status">Showing {matches.filter(Boolean).length} of {ballots.length} resolutions</p><div className="flex gap-4"><button type="button" className="py-1 font-semibold underline" onClick={() => setExpanded((previous) => ({ ...previous, ...Object.fromEntries(ballots.filter((_, index) => matches[index]).map((ballot) => [ballot.id, true])) }))}>Expand shown items</button><button type="button" className="py-1 font-semibold underline" onClick={() => setExpanded({})}>Collapse all</button></div></div>
    </div>}
    <ol aria-label="Resolution checklist" className="mt-3 grid gap-3">
      {ballots.map((ballot, index) => {
        const task = tasks[index];
        const isExpanded = !!expanded[ballot.id];
        const consent = ballot.consent;
        const cancelled = ballot.effectiveStatus === "cancelled";
        const legacy = !ballot.consentMode;
        const current = consent?.viewerReceipt;
        const hasConsent = current?.action === "consent";
        const canManageBallot = canManage && (!ballot.reviewRequired || canCoordinateReviews);
        const needsReviewStart = ballot.reviewRequired && (!ballot.review?.round || ballot.review.rosterChanged);
        const reviewReady = !ballot.reviewRequired || (!needsReviewStart && reviewProgress(ballot.review?.round).complete);
        const status = legacy ? `Legacy ballot · ${ballot.effectiveStatus}` : ballot.effectiveStatus === "closed" ? "Adopted by unanimous written consent" : ballot.effectiveStatus === "awaiting-finalization" ? "Collection ended · not adopted" : ballot.effectiveStatus === "open" ? "Collecting consents" : ballot.effectiveStatus === "scheduled" ? "Collection scheduled" : ballot.effectiveStatus === "cancelled" ? "Cancelled · not adopted" : "Draft resolution";
        const signatureForm = (withdraw: boolean) => <form className="mt-4 grid gap-3 rounded-xl border border-[var(--border)] bg-white p-4" onSubmit={async (event) => {
          event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
          const saved = await post({ action: withdraw ? "withdrawConsent" : "signConsent", ballotId: ballot.id, contentHash: consent?.contentHash, signatureName: data.get("signatureName"), intent: data.get("intent") === "on" }, withdraw ? "Your signed withdrawal was delivered and retained." : "Your signed consent was delivered and retained.");
          if (saved) form.reset();
        }}>
          <p className="text-sm leading-6">{withdraw ? (consent?.withdrawalStatement || WITHDRAWAL_STATEMENT) : (consent?.statement || CONSENT_STATEMENT)}</p>
          <p className="text-xs text-[var(--muted)]">Your signature is retained as a corporate record. Directors and the Executive Director can see your consent or withdrawal status and delivery time during collection. After adoption, the consent record and receipt history are available to Board portal users.</p>
          <label className="text-sm font-semibold">Full name as electronic signature<input name="signatureName" required maxLength={200} autoComplete="name" className={field} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="intent" required className="mt-1" /><span>I intend to electronically sign and deliver {withdraw ? "this withdrawal" : "my consent to this resolution"}.</span></label>
          <button disabled={pending} className={withdraw ? secondary : button}>{withdraw ? "Sign and deliver withdrawal" : "Sign and deliver consent"}</button>
        </form>;
        return <li key={ballot.id} id={`ballot-${ballot.id}`} data-resolution-id={ballot.id} hidden={!matches[index]} className={`min-w-0 scroll-mt-28 rounded-2xl border ${cancelled ? "border-stone-300 border-l-4 border-l-stone-400 bg-stone-100" : "border-[var(--border)] bg-white"}`}>
          <h3><button id={`ballot-${ballot.id}-toggle`} type="button" aria-expanded={isExpanded} aria-controls={`ballot-${ballot.id}-content`} onClick={() => setExpanded((previous) => ({ ...previous, [ballot.id]: !previous[ballot.id] }))} className="flex w-full items-start gap-3 rounded-2xl p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] sm:p-5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-semibold" aria-hidden="true">{index + 1}</span>
            <span className="min-w-0 flex-1"><span className="block text-base font-semibold [overflow-wrap:anywhere]">{ballot.title}</span><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${task.tone === "attention" ? "bg-amber-100 text-amber-950" : task.tone === "positive" ? "bg-emerald-50 text-emerald-900" : "bg-stone-200/70 text-stone-800"}`}>{task.label}</span>
              <span className="mt-2 block text-xs font-normal leading-5 text-[var(--muted)]">{cancelled ? "Not adopted" : ballot.effectiveStatus === "draft" && ballot.review?.round ? "Director review in progress · consents not open" : status}{consent ? ` · ${ballot.ballotsCast}/${ballot.eligibleCount} consents` : ""}{` · ${ballot.attachments?.length || 0} ${ballot.attachments?.length === 1 ? "document" : "documents"} · ${ballot.discussionMessages.length} ${ballot.discussionMessages.length === 1 ? "discussion message" : "discussion messages"}`}</span>
            </span><ChevronDown aria-hidden="true" className={`mt-1 h-5 w-5 shrink-0 text-[var(--muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button></h3>
          <div id={`ballot-${ballot.id}-content`} hidden={!isExpanded} className="border-t border-[var(--border)] px-4 pb-5 sm:px-5">
          <p className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3 text-sm leading-6">{task.detail}</p>
          {cancelled && <p className="mt-2 text-sm text-stone-700">Not adopted. Consent collection is closed; this item is retained for reference.</p>}
          <details open={ballot.effectiveStatus !== "draft" || !!ballot.review?.round} className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">Resolution text and documents{ballot.attachments?.length ? ` (${ballot.attachments.length})` : ""}</summary>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{ballot.motion}</p>
            {!!ballot.attachments?.length && <ul className="mt-3 grid gap-1">{ballot.attachments.map((doc) => <li key={`${doc.documentId}:${doc.versionId}`} className="text-sm"><a className="font-semibold underline" href={`/api/documents/${encodeURIComponent(doc.documentId)}/download?version=${encodeURIComponent(doc.versionId)}&consentMeeting=${encodeURIComponent(meeting.id)}&consentBallot=${encodeURIComponent(ballot.id)}`}>{doc.title} · v{doc.sequence}</a>{doc.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--muted)]">{doc.description}</p>}</li>)}</ul>}
            {ballot.adoption && <div className="mt-3 rounded-xl border border-[var(--border)] bg-white p-3 text-sm">
              <p className="font-semibold">{cancelled ? "Proposed document adoption targets" : "Documents this resolution adopts"}</p>
              {ballot.adoption.targets.length ? <ul className="mt-2 grid gap-2">{ballot.adoption.targets.map((target) => {
                const doc = ballot.attachments?.find((doc) => doc.documentId === target.documentId && doc.versionId === target.versionId);
                return <li key={target.documentId}>{doc?.title} · v{doc?.sequence}{consent?.adoptedAt && <a className="ml-2 font-semibold underline" href={`/api/meetings/${encodeURIComponent(meeting.id)}/ballots/${encodeURIComponent(ballot.id)}/packet?document=${encodeURIComponent(target.documentId)}`}>Download adoption packet</a>}</li>;
              })}</ul> : <p>No document adoption targets. Attached documents are supporting materials.</p>}
              <p className="mt-2 whitespace-pre-wrap break-words"><strong>Effective date / conditions:</strong> {ballot.adoption.effectiveTerms || "See the resolution. Adoption does not establish that implementation conditions have been met."}</p>
            </div>}
          </details>
          <ResolutionReviewPanel ballot={ballot} meeting={meeting} pending={pending} onPost={post} />
          {legacy ? <p className="mt-3 text-sm">This historical ballot is not a signed written consent. Its recorded result is preserved; prepare a new resolution to take action under the unanimous-consent process.</p> : null}
          {legacy && ballot.result && <p className="mt-2 text-sm">Historical result: {ballot.result.outcome} · Yes {ballot.result.yes}, No {ballot.result.no}, Abstain {ballot.result.abstain}, Recused {ballot.result.recused}.</p>}
          {consent && <>
            <p className="mt-4 text-sm font-semibold">{cancelled ? `${ballot.ballotsCast} of ${ballot.eligibleCount} directors had consent on record at cancellation. Collection is closed.` : `${ballot.ballotsCast} of ${ballot.eligibleCount} directors have delivered consent. Every director is required.`}</p>
            {consent.directorStatuses && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">See each director’s consent status</summary><section aria-labelledby={`consent-status-${ballot.id}`} className="mt-3 rounded-xl border border-[var(--border)] bg-white p-3 sm:p-4">
              <h4 id={`consent-status-${ballot.id}`} className="text-sm font-semibold">{cancelled ? "Director consent status at cancellation" : "Director consent status"}</h4>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{cancelled ? "Historical record, visible to directors and the Executive Director. No further consents can be delivered to this cancelled item." : "Visible to directors and the Executive Director. “Not yet consented” means no consent has been delivered; it does not indicate opposition."} Times shown in {meeting.timeZone}.</p>
              <ul className="mt-2 divide-y divide-[var(--border)]">
                {consent.directorStatuses.map((person) => <li key={person.userId} className="grid gap-1 py-2.5 text-sm sm:grid-cols-2 sm:gap-4">
                  <span className="min-w-0 break-words font-medium">{person.name}</span>
                  <div className="min-w-0">
                    <p className="font-semibold">{person.status === "consented" ? "Consented" : person.status === "withdrawn" ? "Withdrawn" : cancelled ? "No consent recorded" : "Not yet consented"}</p>
                    {person.receivedAt && <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{person.status === "withdrawn" ? "Withdrawal received" : "Consent received"} <time dateTime={person.receivedAt}>{new Date(person.receivedAt).toLocaleString("en-US", { timeZone: meeting.timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time></p>}
                  </div>
                </li>)}
              </ul>
            </section></details>}
            <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold">Required directors and record details</summary>
              <ul className="mt-2">{consent.directors.map((person) => <li key={person.userId}>{person.name} ({person.email})</li>)}</ul>
              <p className="mt-2 break-all text-xs">Resolution SHA-256: {consent.contentHash}</p>
              <p className="mt-2">Collection: {new Date(consent.startAt).toLocaleString()} – {new Date(consent.endAt).toLocaleString()}</p>
            </details>
            {consent.rosterChanged && ballot.effectiveStatus !== "closed" && !cancelled && <p className="mt-3 text-sm font-semibold text-amber-900">The director roster changed. Further consents are paused. The Chair must prepare a new collection after verifying the full board.</p>}
            {current && <p className="mt-3 text-sm">Your signed {hasConsent ? "consent" : "withdrawal"} was received {new Date(current.receivedAt).toLocaleString()}. Receipt: <span className="break-all">{current.id}</span>.</p>}
            {consent.adoptedAt && <p className="mt-2 text-sm font-semibold">Adopted {new Date(consent.adoptedAt).toLocaleString()} when the final required consent was received.</p>}
            <a className="mt-3 inline-block text-sm font-semibold underline" href={`/api/meetings/${encodeURIComponent(meeting.id)}/ballots/${encodeURIComponent(ballot.id)}/record`} target="_blank" rel="noreferrer">View / print consent record</a>
            {ballot.viewerEligible && active && ballot.effectiveStatus === "open" && !hasConsent && !consent.rosterChanged && signatureForm(false)}
            {ballot.viewerEligible && active && hasConsent && ["open", "awaiting-finalization", "scheduled"].includes(ballot.effectiveStatus) && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Withdraw my consent before adoption</summary>{signatureForm(true)}</details>}
          </>}
          {ballot.effectiveStatus !== "draft" && <details className="mt-4 rounded-xl border border-[var(--border)] bg-white p-3">
            <summary className="cursor-pointer rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]">Discussion ({ballot.discussionMessages.length}){cancelled ? " · reference only" : ""}</summary>
            <BallotDiscussion meetingId={meeting.id} ballot={ballot} canDiscuss={canDiscuss && !legacy && active && !cancelled} timeZone={meeting.timeZone} />
          </details>}
          {canManageBallot && active && !cancelled && <details className="mt-4 border-t border-[var(--border)] pt-3"><summary className="cursor-pointer text-sm font-semibold">Resolution management</summary><div className="mt-3 grid gap-3">
            {ballot.effectiveStatus === "draft" && !legacy && <>
              <details><summary className="cursor-pointer text-sm font-semibold">Edit draft resolution</summary>{draftForm(ballot)}</details>
              {needsReviewStart && meeting.status !== "draft" && <form className="grid gap-3" onSubmit={(event) => {
                event.preventDefault(); const data = new FormData(event.currentTarget);
                void post({ action: "startReview", ballotId: ballot.id, rosterRevision: directorRoster?.revision, rosterConfirmed: data.get("rosterConfirmed") === "on" }, "Director review started for these exact materials. Consent collection remains closed.");
              }}>
                {directorRoster?.ready ? <><p className="text-sm font-semibold">Reviewers: every current director</p><ul className="text-sm">{directorRoster.directors.map((person) => <li key={person.userId}>{person.name} ({person.email}) · {person.status}</li>)}</ul><label className="flex items-start gap-2 text-sm"><input name="rosterConfirmed" type="checkbox" required className="mt-1" /><span>I confirm that this list includes every director currently in office. Starting review does not authorize this action or resolve any conflict.</span></label></> : <p className="text-sm text-amber-900">The director roster must be initialized before review can begin.</p>}
                <button disabled={pending || !directorRoster?.ready} className={button}>{ballot.review?.everStarted ? "Restart director review" : "Start director review"}</button>
              </form>}
              {!legacy && !needsReviewStart && meeting.status !== "draft" && <form className="grid gap-3" onSubmit={(event) => {
                event.preventDefault(); const data = new FormData(event.currentTarget);
                void post({ action: "openBallot", ballotId: ballot.id, rosterRevision: directorRoster?.revision, rosterConfirmed: data.get("rosterConfirmed") === "on", reviewRecordConfirmed: data.get("reviewRecordConfirmed") === "on", reviewFindings: data.get("reviewFindings") }, "Consent collection opened for every listed director.");
              }}>
                {ballot.reviewRequired && <>
                  <p className="text-sm font-semibold">{reviewReady ? "All directors have recorded readiness. Complete the review record before opening consents." : "Consent collection is blocked until every director records readiness and unresolved issues are addressed."}</p>
                  <label className="text-sm font-semibold">Findings presented for adoption<textarea required name="reviewFindings" maxLength={4000} rows={4} className={field} /><span className="mt-1 block text-xs font-normal">Summarize the completed review and basis for the proposed action. These findings and each director&apos;s review will be fixed and bound to the signed consent. Material changes to the resolution or attachments require a new review round.</span></label>
                  <label className="flex items-start gap-2 text-sm"><input name="reviewRecordConfirmed" type="checkbox" required className="mt-1" /><span>I have assembled the required review evidence, addressed outstanding issues and timing requirements, and confirmed that the final resolution states all approval terms. This records readiness for consent, not adoption.</span></label>
                </>}
                {directorRoster?.ready ? <><p className="text-sm font-semibold">Review all {directorRoster.directors.length} directors before opening:</p><ul className="text-sm">{directorRoster.directors.map((person) => <li key={person.userId}>{person.name} ({person.email}) · {person.status}</li>)}</ul><label className="flex items-start gap-2 text-sm"><input name="rosterConfirmed" type="checkbox" required className="mt-1" /><span>{ROSTER_CONFIRMATION}</span></label></> : <p className="text-sm text-amber-900">The director roster must be initialized before consent collection can open.</p>}
                <button disabled={pending || !directorRoster?.ready || !reviewReady} className={button}>Open consent collection</button>
              </form>}
            </>}
            {consent && !consent.rosterChanged && ballot.effectiveStatus === "open" && <button disabled={pending} className={secondary} onClick={() => post({ action: "send-vote-reminder", ballotId: ballot.id, communicationId: crypto.randomUUID() }, "Reminders sent to directors with outstanding consents.", true)}>Remind directors with outstanding consents</button>}
            {!["closed", "cancelled"].includes(ballot.effectiveStatus) && <details><summary className="cursor-pointer text-sm font-semibold">Cancel collection without adoption</summary><form className="mt-2 grid gap-2" onSubmit={(event) => { event.preventDefault(); void post({ action: "cancelBallot", ballotId: ballot.id, reason: new FormData(event.currentTarget).get("reason") }, "Collection cancelled without adoption. Existing receipts remain retained."); }}><label className="text-sm">Reason<input required name="reason" maxLength={2000} className={field} /></label><button disabled={pending} className={secondary}>Confirm cancellation</button></form></details>}
          </div></details>}
          </div>
        </li>;
      })}
    </ol>
    {!!ballots.length && !matches.some(Boolean) && <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-4 text-sm"><p>{filter === "attention" && !query ? "No items currently need your review or consent. Check Waiting for items that may open later." : "No resolutions match this view."}</p><button type="button" className="mt-2 font-semibold underline" onClick={() => { setQuery(""); setFilter("all"); }}>Show all resolutions</button></div>}
    {!ballots.length && <p className="mt-5 text-sm">No resolutions have been prepared yet.</p>}
    {canManage && active && <details className="mt-5 rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer font-semibold">Add written resolution</summary>{draftForm()}</details>}
    <p role="status" className="mt-4 text-sm font-semibold">{pending ? "Saving…" : message}</p>
  </Surface>;
}
