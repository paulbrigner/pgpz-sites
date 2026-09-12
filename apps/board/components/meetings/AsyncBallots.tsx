"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Surface } from "@pgpz/ui";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import { CONSENT_STATEMENT, WITHDRAWAL_STATEMENT, ROSTER_CONFIRMATION } from "@/lib/written-consents";
import type { AsyncBallotView, MeetingDetailView, MeetingSummaryView } from "./types";
import { BallotDiscussion } from "./BallotDiscussion";
import { ResolutionDraftForm } from "./ResolutionDraftForm";

const field = "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm";
const button = "w-fit rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "w-fit rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";

export function AsyncBallots({ meeting, ballots, canManage, canDiscuss, documentChoices = [], directorRoster = null }: {
  meeting: MeetingSummaryView; ballots: AsyncBallotView[]; canManage: boolean; canDiscuss: boolean;
  documentChoices?: MeetingDetailView["consentDocumentChoices"]; directorRoster?: MeetingDetailView["directorRoster"];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const active = ["draft", "scheduled", "materials-published"].includes(meeting.status);
  async function post(body: Record<string, unknown>, success: string, communications = false) {
    setPending(true); setMessage("");
    try {
      const response = await fetchWithBoardStepUp(`/api/meetings/${encodeURIComponent(meeting.id)}/${communications ? "communications" : "ballots"}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: meeting.version, ...body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The record could not be saved.");
      setMessage(result.adopted ? "All directors have delivered consent. This resolution is now adopted." : success);
      router.refresh(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save. Refresh to check your receipt before retrying."); return false; }
    finally { setPending(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>, ballot?: AsyncBallotView) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    const selections = data.getAll("document").filter(Boolean).map((value) => JSON.parse(String(value)));
    const attachments = selections.map(({ documentId, versionId, description }) => ({ documentId, versionId, ...(description ? { description } : {}) }));
    const adoption = { targets: selections.filter((item) => item.treatment === "adopt").map(({ documentId, versionId }) => ({ documentId, versionId })), effectiveTerms: String(data.get("effectiveTerms") || "") };
    const saved = await post({ action: "saveBallot", ...(ballot ? { ballotId: ballot.id } : {}), title: data.get("title"), motion: data.get("motion"), attachments, adoption }, "Draft resolution saved. Review its exact document versions and adoption targets before opening collection.");
    return saved;
  }
  function draftForm(ballot?: AsyncBallotView) {
    return <ResolutionDraftForm ballot={ballot} documentChoices={documentChoices} pending={pending} onSave={(event) => save(event, ballot)} />;
  }

  return <Surface className="p-5 sm:p-6">
    <h2 className="text-xl font-semibold">Resolutions by unanimous written consent</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">This is action without a meeting. Each resolution is adopted when every director has signed and delivered consent to that exact action. A majority, an abstention, a recusal, or silence cannot adopt it. Consent to using this process does not approve any resolution.</p>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">If you cannot approve an item, discuss it here and leave it unsigned. Resolve conflicts through the Chair or counsel; this workflow cannot exclude a director to obtain unanimity. An amended resolution needs fresh consents from everyone.</p>
    <ol className="mt-5 grid gap-5">
      {ballots.map((ballot) => {
        const consent = ballot.consent;
        const legacy = !ballot.consentMode;
        const current = consent?.viewerReceipt;
        const hasConsent = current?.action === "consent";
        const status = legacy ? `Legacy ballot · ${ballot.effectiveStatus}` : ballot.effectiveStatus === "closed" ? "Adopted by unanimous written consent" : ballot.effectiveStatus === "awaiting-finalization" ? "Collection ended · not adopted" : ballot.effectiveStatus === "open" ? "Collecting consents" : ballot.effectiveStatus === "scheduled" ? "Collection scheduled" : ballot.effectiveStatus === "cancelled" ? "Cancelled · not adopted" : "Draft resolution";
        const signatureForm = (withdraw: boolean) => <form className="mt-4 grid gap-3 rounded-xl border border-[var(--border)] bg-white p-4" onSubmit={async (event) => {
          event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
          const saved = await post({ action: withdraw ? "withdrawConsent" : "signConsent", ballotId: ballot.id, contentHash: consent?.contentHash, signatureName: data.get("signatureName"), intent: data.get("intent") === "on" }, withdraw ? "Your signed withdrawal was delivered and retained." : "Your signed consent was delivered and retained.");
          if (saved) form.reset();
        }}>
          <p className="text-sm leading-6">{withdraw ? (consent?.withdrawalStatement || WITHDRAWAL_STATEMENT) : (consent?.statement || CONSENT_STATEMENT)}</p>
          <p className="text-xs text-[var(--muted)]">Your signature is retained as a corporate record. Directors can see your consent or withdrawal status and delivery time during collection. After adoption, the consent record and receipt history are available to Board portal users.</p>
          <label className="text-sm font-semibold">Full name as electronic signature<input name="signatureName" required maxLength={200} autoComplete="name" className={field} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="intent" required className="mt-1" /><span>I intend to electronically sign and deliver {withdraw ? "this withdrawal" : "my consent to this resolution"}.</span></label>
          <button disabled={pending} className={withdraw ? secondary : button}>{withdraw ? "Sign and deliver withdrawal" : "Sign and deliver consent"}</button>
        </form>;
        return <li key={ballot.id} id={`ballot-${ballot.id}`} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:p-5">
          <p className="text-xs font-semibold text-[var(--muted)]">{status}</p>
          <h3 className="mt-2 text-lg font-semibold">{ballot.title}</h3>
          <details open={ballot.effectiveStatus !== "draft"} className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">Resolution text and documents{ballot.attachments?.length ? ` (${ballot.attachments.length})` : ""}</summary>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{ballot.motion}</p>
            {!!ballot.attachments?.length && <ul className="mt-3 grid gap-1">{ballot.attachments.map((doc) => <li key={`${doc.documentId}:${doc.versionId}`} className="text-sm"><a className="font-semibold underline" href={`/api/documents/${encodeURIComponent(doc.documentId)}/download?version=${encodeURIComponent(doc.versionId)}&consentMeeting=${encodeURIComponent(meeting.id)}&consentBallot=${encodeURIComponent(ballot.id)}`}>{doc.title} · v{doc.sequence}</a>{doc.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--muted)]">{doc.description}</p>}</li>)}</ul>}
            {ballot.adoption && <div className="mt-3 rounded-xl border border-[var(--border)] bg-white p-3 text-sm">
              <p className="font-semibold">Documents this resolution adopts</p>
              {ballot.adoption.targets.length ? <ul className="mt-2 grid gap-2">{ballot.adoption.targets.map((target) => {
                const doc = ballot.attachments?.find((doc) => doc.documentId === target.documentId && doc.versionId === target.versionId);
                return <li key={target.documentId}>{doc?.title} · v{doc?.sequence}{consent?.adoptedAt && <a className="ml-2 font-semibold underline" href={`/api/meetings/${encodeURIComponent(meeting.id)}/ballots/${encodeURIComponent(ballot.id)}/packet?document=${encodeURIComponent(target.documentId)}`}>Download adoption packet</a>}</li>;
              })}</ul> : <p>No document adoption targets. Attached documents are supporting materials.</p>}
              <p className="mt-2 whitespace-pre-wrap break-words"><strong>Effective date / conditions:</strong> {ballot.adoption.effectiveTerms || "See the resolution. Adoption does not establish that implementation conditions have been met."}</p>
            </div>}
          </details>
          {legacy ? <p className="mt-3 text-sm">This historical ballot is not a signed written consent. Its recorded result is preserved; prepare a new resolution to take action under the unanimous-consent process.</p> : null}
          {legacy && ballot.result && <p className="mt-2 text-sm">Historical result: {ballot.result.outcome} · Yes {ballot.result.yes}, No {ballot.result.no}, Abstain {ballot.result.abstain}, Recused {ballot.result.recused}.</p>}
          {consent && <>
            <p className="mt-4 text-sm font-semibold">{ballot.ballotsCast} of {ballot.eligibleCount} directors have delivered consent. Every director is required.</p>
            {consent.directorStatuses && <section aria-labelledby={`consent-status-${ballot.id}`} className="mt-3 rounded-xl border border-[var(--border)] bg-white p-3 sm:p-4">
              <h4 id={`consent-status-${ballot.id}`} className="text-sm font-semibold">Director consent status</h4>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Visible to directors. “Not yet consented” means no consent has been delivered; it does not indicate opposition. Times shown in {meeting.timeZone}.</p>
              <ul className="mt-2 divide-y divide-[var(--border)]">
                {consent.directorStatuses.map((person) => <li key={person.userId} className="grid gap-1 py-2.5 text-sm sm:grid-cols-2 sm:gap-4">
                  <span className="min-w-0 break-words font-medium">{person.name}</span>
                  <div className="min-w-0">
                    <p className="font-semibold">{person.status === "consented" ? "Consented" : person.status === "withdrawn" ? "Withdrawn" : "Not yet consented"}</p>
                    {person.receivedAt && <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{person.status === "withdrawn" ? "Withdrawal received" : "Consent received"} <time dateTime={person.receivedAt}>{new Date(person.receivedAt).toLocaleString("en-US", { timeZone: meeting.timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time></p>}
                  </div>
                </li>)}
              </ul>
            </section>}
            <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold">Required directors and record details</summary>
              <ul className="mt-2">{consent.directors.map((person) => <li key={person.userId}>{person.name} ({person.email})</li>)}</ul>
              <p className="mt-2 break-all text-xs">Resolution SHA-256: {consent.contentHash}</p>
              <p className="mt-2">Collection: {new Date(consent.startAt).toLocaleString()} – {new Date(consent.endAt).toLocaleString()}</p>
            </details>
            {consent.rosterChanged && ballot.effectiveStatus !== "closed" && <p className="mt-3 text-sm font-semibold text-amber-900">The director roster changed. Further consents are paused. The Chair must prepare a new collection after verifying the full board.</p>}
            {current && <p className="mt-3 text-sm">Your signed {hasConsent ? "consent" : "withdrawal"} was received {new Date(current.receivedAt).toLocaleString()}. Receipt: <span className="break-all">{current.id}</span>.</p>}
            {consent.adoptedAt && <p className="mt-2 text-sm font-semibold">Adopted {new Date(consent.adoptedAt).toLocaleString()} when the final required consent was received.</p>}
            <a className="mt-3 inline-block text-sm font-semibold underline" href={`/api/meetings/${encodeURIComponent(meeting.id)}/ballots/${encodeURIComponent(ballot.id)}/record`} target="_blank" rel="noreferrer">View / print consent record</a>
            {ballot.viewerEligible && active && ballot.effectiveStatus === "open" && !hasConsent && !consent.rosterChanged && signatureForm(false)}
            {ballot.viewerEligible && active && hasConsent && ["open", "awaiting-finalization", "scheduled"].includes(ballot.effectiveStatus) && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Withdraw my consent before adoption</summary>{signatureForm(true)}</details>}
          </>}
          {ballot.effectiveStatus !== "draft" && <div className="mt-4"><BallotDiscussion meetingId={meeting.id} ballot={ballot} canDiscuss={canDiscuss && !legacy && active} timeZone={meeting.timeZone} /></div>}
          {canManage && active && <div className="mt-4 grid gap-3 border-t border-[var(--border)] pt-3">
            {ballot.effectiveStatus === "draft" && !legacy && <>
              <details><summary className="cursor-pointer text-sm font-semibold">Edit draft resolution</summary>{draftForm(ballot)}</details>
              {!legacy && meeting.status !== "draft" && <form className="grid gap-3" onSubmit={(event) => {
                event.preventDefault(); const data = new FormData(event.currentTarget);
                void post({ action: "openBallot", ballotId: ballot.id, rosterRevision: directorRoster?.revision, rosterConfirmed: data.get("rosterConfirmed") === "on" }, "Consent collection opened for every listed director.");
              }}>
                {directorRoster?.ready ? <><p className="text-sm font-semibold">Review all {directorRoster.directors.length} directors before opening:</p><ul className="text-sm">{directorRoster.directors.map((person) => <li key={person.userId}>{person.name} ({person.email}) · {person.status}</li>)}</ul><label className="flex items-start gap-2 text-sm"><input name="rosterConfirmed" type="checkbox" required className="mt-1" /><span>{ROSTER_CONFIRMATION}</span></label></> : <p className="text-sm text-amber-900">The director roster must be initialized before consent collection can open.</p>}
                <button disabled={pending || !directorRoster?.ready} className={button}>Open consent collection</button>
              </form>}
            </>}
            {consent && !consent.rosterChanged && ballot.effectiveStatus === "open" && <button disabled={pending} className={secondary} onClick={() => post({ action: "send-vote-reminder", ballotId: ballot.id, communicationId: crypto.randomUUID() }, "Reminders sent to directors with outstanding consents.", true)}>Remind directors with outstanding consents</button>}
            {!["closed", "cancelled"].includes(ballot.effectiveStatus) && <details><summary className="cursor-pointer text-sm font-semibold">Cancel collection without adoption</summary><form className="mt-2 grid gap-2" onSubmit={(event) => { event.preventDefault(); void post({ action: "cancelBallot", ballotId: ballot.id, reason: new FormData(event.currentTarget).get("reason") }, "Collection cancelled without adoption. Existing receipts remain retained."); }}><label className="text-sm">Reason<input required name="reason" maxLength={2000} className={field} /></label><button disabled={pending} className={secondary}>Confirm cancellation</button></form></details>}
          </div>}
        </li>;
      })}
    </ol>
    {!ballots.length && <p className="mt-5 text-sm">No resolutions have been prepared yet.</p>}
    {canManage && active && <details className="mt-5 rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer font-semibold">Add written resolution</summary>{draftForm()}</details>}
    <p role="status" className="mt-4 text-sm font-semibold">{pending ? "Saving…" : message}</p>
  </Surface>;
}
