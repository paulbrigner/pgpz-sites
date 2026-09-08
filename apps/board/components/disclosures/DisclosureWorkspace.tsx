"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Surface } from "@pgpz/ui";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import { DISCLOSURE_CATEGORIES, DISCLOSURE_ELECTRONIC_CONSENT, disclosureAcknowledgment, disclosureDirector, disclosureStatus, type DisclosureCandidate, type DisclosureForm, type DisclosureView } from "@/lib/disclosures";

const field = "mt-2 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-[var(--foreground)]";
const button = "rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "rounded-full border border-[var(--border-strong)] px-5 py-2.5 text-sm font-semibold disabled:opacity-50";
function FormSummary({ form, questions = DISCLOSURE_CATEGORIES }: { form: DisclosureForm; questions?: readonly string[] }) {
  return <div className="mt-4 space-y-5"><p><strong>Roles:</strong> {form.roles}</p>{form.matter && <p className="whitespace-pre-wrap"><strong>Matter and circumstances:</strong> {form.matter}</p>}{form.answers.map((answer, index) => <div key={index}><h3 className="text-sm font-semibold">{index + 1}. {questions[index]}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted)]">{answer.choice === "none" ? "None" : answer.details || "Not answered"}</p></div>)}</div>;
}
export function DisclosureWorkspace({ initial, candidates }: { initial: DisclosureView; candidates: DisclosureCandidate[] }) {
  const router = useRouter(); const [view, setView] = useState(initial);
  const latest = [...view.events].reverse().find((event) => event.kind === "submission");
  const [form, setForm] = useState<DisclosureForm>(() => initial.draft?.form ?? (latest?.kind === "submission" ? latest.form : { roles: "", matter: "", answers: DISCLOSURE_CATEGORIES.map(() => ({ choice: "", details: "" })) }));
  const [editing, setEditing] = useState(initial.isSubject && initial.request.revision === 0); const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false); const [signedName, setSignedName] = useState("");
  const { request, isSubject, isReviewer, isCounsel } = view; const api = `/api/disclosures/${request.id}`;
  async function reload() {
    const response = await fetch(api, { cache: "no-store" }); const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    if (value.draft?.hash !== view.draft?.hash) {
      // Another tab may have changed the draft. An earlier acknowledgment must
      // never carry forward onto newly fetched answers after an unrelated action.
      setPreview(false); setAccepted(false); setSignedName("");
      if (value.draft) setForm(value.draft.form);
    }
    setView(value); return value as DisclosureView;
  }
  async function mutate(input: Record<string, unknown>, success: string, leave = false) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetchWithBoardStepUp(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, expectedVersion: request.version }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (leave) { router.push("/disclosures"); router.refresh(); return true; }
      await reload(); setMessage(success); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete the request."); return false; } finally { setBusy(false); }
  }
  async function save(prepare: boolean) {
    if (await mutate({ action: prepare ? "prepare" : "save", form }, prepare ? "Review the saved answers and policy before signing." : "Draft saved. Only you can see these draft answers.")) { setPreview(prepare); setAccepted(false); setSignedName(""); }
  }
  async function sign(event: React.FormEvent) {
    event.preventDefault();
    if (await mutate({ action: "sign", draftHash: view.draft?.hash, accepted, signedName }, "Your signed disclosure was delivered and retained. You can notify the reviewing director below.")) { setEditing(false); setPreview(false); setAccepted(false); setSignedName(""); }
  }
  async function remind(target: "subject" | "reviewer") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetchWithBoardStepUp(`${api}/reminder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: request.version, target }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      await reload(); setMessage(result.status === "sent" ? "The email provider accepted the reminder." : "Delivery is uncertain. Check with the recipient before trying again.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send."); } finally { setBusy(false); }
  }
  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await mutate({ action: isReviewer ? "review" : "comment", submissionHash: request.latestHash, independent: data.get("independent") === "on", outcome: data.get("outcome"), note: data.get("note") }, "Review note retained with this signed revision.");
  }
  async function route(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await mutate({ action: "route", reviewerId: data.get("reviewerId"), counselId: data.get("counselId"), note: data.get("note") }, "Review assignment changed.", !isSubject);
  }
  const unavailable = new Set([request.subject.accessId, ...request.excludedIds]);
  return <div className="mt-7 space-y-6">
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900"><p>{error}</p><button className="mt-2 text-sm underline" disabled={busy} onClick={() => { setPreview(false); reload().then(() => setError("")).catch(() => router.refresh()); }}>Refresh current record</button></div>}
    {message && <p role="status" className="rounded-xl bg-[var(--primary-soft)] p-4">{message}</p>}
    <Surface className="p-6"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-xl font-semibold">{request.subject.name} · {request.year}</h2><p className="mt-1 text-sm text-[var(--muted)]">{request.kind === "annual" ? "Annual disclosure and acknowledgment" : "Matter-specific disclosure"} · {disclosureStatus(request.status)}{request.dueDate ? ` · Due ${request.dueDate}` : ""}</p></div>{isSubject && !editing && <button disabled={busy} className={secondary} onClick={() => { setEditing(true); setPreview(false); }}>{request.revision ? "Prepare an amendment" : "Complete disclosure"}</button>}</div>
      <p className="mt-5 text-sm leading-6">Reviewing director: <strong>{request.reviewer.name}</strong>. {request.counsel ? <>Invited counsel: <strong>{request.counsel.name}</strong>.</> : "No counsel invited."} Submitted answers and review notes are shared with this group and the person disclosing. Unsubmitted drafts are visible only to the person disclosing.</p>
      <p className="mt-3 text-sm leading-6"><Link href={`${api}/policy`} target="_blank" className="font-semibold underline underline-offset-4">Read {request.policy.title} · version {request.policy.sequence}</Link> · {request.policy.adoption === "proposed" ? "Proposed policy" : "Adopted policy (as designated when assigned)"}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">Review the designated policy. Explain relevant relationships and interests; wallet addresses and exact asset values are ordinarily unnecessary. If a reviewer is implicated, change the assignment below before submitting sensitive details.</p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">{(isSubject || isReviewer) && <button disabled={busy} onClick={() => remind(isSubject ? "reviewer" : "subject")} className="underline underline-offset-4 disabled:opacity-50">{isSubject ? "Email reviewing director" : "Email person disclosing"}</button>}{request.revision > 0 && <><Link href={`${api}/record`} target="_blank" className="underline underline-offset-4">Print / save signed record</Link><Link href={`${api}/record?format=json`} target="_blank" className="underline underline-offset-4">Export signed record (JSON)</Link></>}</div>
      {request.lastNoticeAt && <p className="mt-3 text-xs text-[var(--muted)]">Last email attempt: {request.lastNoticeAt} · {request.lastNoticeStatus === "sent" ? "Accepted by provider" : "Delivery unconfirmed; check before resending"}</p>}
    </Surface>
    {isSubject && editing && <Surface className="p-6 sm:p-8"><h2 className="text-2xl font-semibold">{preview ? "Review and sign your disclosure" : request.revision ? "Amend your disclosure" : "Complete your disclosure"}</h2><p className="mt-2 text-sm text-[var(--muted)]">Each amendment becomes a new signed record. Earlier signed versions remain available. Saving a draft does not update the submitted disclosure.</p>
      {preview && view.draft ? <><FormSummary form={view.draft.form}/><form onSubmit={sign} className="mt-7 space-y-5 border-t border-[var(--border)] pt-6"><p className="text-sm leading-7">{disclosureAcknowledgment(request.policy)}</p><p className="text-sm leading-7">{DISCLOSURE_ELECTRONIC_CONSENT}</p><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1"/>I have read the saved disclosure and exact policy version above, affirm the acknowledgment, and consent to sign electronically.</label><label className="block text-sm font-medium">Type your account name: {request.subject.name}<input required autoComplete="name" maxLength={200} value={signedName} onChange={(event) => setSignedName(event.target.value)} className={field}/></label><div className="flex flex-wrap gap-3"><button type="submit" disabled={busy || !accepted} className={button}>Sign and deliver</button><button type="button" disabled={busy} className={secondary} onClick={() => { setPreview(false); setAccepted(false); }}>Back to editing</button></div></form></> : <div className="mt-6 space-y-6"><label className="block text-sm font-medium">Your role(s)<input maxLength={300} value={form.roles} onChange={(event) => setForm({ ...form, roles: event.target.value })} className={field} placeholder="For example: Director; Executive Director"/></label><label className="block text-sm font-medium">{request.kind === "matter" ? "Matter and relevant circumstances (required)" : "Additional context or update since your last disclosure (optional)"}<textarea rows={3} maxLength={4000} value={form.matter} onChange={(event) => setForm({ ...form, matter: event.target.value })} className={field}/></label>
        {DISCLOSURE_CATEGORIES.map((category, index) => <fieldset key={category} className="rounded-2xl border border-[var(--border)] p-4 sm:p-5"><legend className="px-2 text-sm font-semibold">{index + 1}. {category}</legend><div className="flex flex-wrap gap-6 text-sm">{(["none", "disclosed"] as const).map((choice) => <label key={choice} className="flex items-center gap-2"><input type="radio" name={`category-${index}`} value={choice} checked={form.answers[index].choice === choice} onChange={() => setForm({ ...form, answers: form.answers.map((answer, position) => position === index ? { choice, details: choice === "none" ? "" : answer.details } : answer) })}/>{choice === "none" ? "None" : "Disclose"}</label>)}</div>{form.answers[index].choice === "disclosed" && <label className="mt-4 block text-sm">Relevant details<textarea maxLength={4000} rows={4} value={form.answers[index].details} onChange={(event) => setForm({ ...form, answers: form.answers.map((answer, position) => position === index ? { ...answer, details: event.target.value } : answer) })} className={field}/></label>}</fieldset>)}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => save(false)} className={secondary}>Save private draft</button><button type="button" disabled={busy} onClick={() => save(true)} className={button}>Review for signature</button>{request.revision > 0 && <button type="button" disabled={busy} className={secondary} onClick={() => setEditing(false)}>Return to signed record</button>}</div>
      </div>}
    </Surface>}
    {view.events.filter((event) => event.kind === "submission").length > 0 && <Surface className="p-6"><h2 className="text-xl font-semibold">Signed submissions</h2>{[...view.events].reverse().map((event) => event.kind === "submission" ? <details key={event.hash} open={event.revision === request.revision} className="mt-5 border-t border-[var(--border)] pt-4"><summary className="cursor-pointer font-semibold">Revision {event.revision} · {new Date(event.deliveredAt).toLocaleString()}</summary><FormSummary form={event.form} questions={event.questions}/><p className="mt-5 text-sm leading-6">{event.acknowledgment}</p><p className="mt-3 text-sm">Signed and delivered by {event.signedName} ({event.actor.email}).</p><p className="mt-2 break-all text-xs text-[var(--muted)]">Verified SHA-256: {event.hash}</p></details> : null)}</Surface>}
    {(isReviewer || isCounsel) && request.revision > 0 && <Surface className="p-6"><h2 className="text-xl font-semibold">{isReviewer ? "Record your review" : "Add counsel’s advice"}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Review signed revision {request.revision}. Record relevant findings, required disclosures to other decision-makers, recusals, and follow-up actions. This step does not approve compensation, a conflicted transaction, or a Board resolution.</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">The person disclosing can read these notes. Keep directors-only deliberation in a restricted executive session.</p><form key={request.latestHash} onSubmit={review} className="mt-5 space-y-5">{isReviewer && <label className="block text-sm font-medium">Review outcome<select name="outcome" className={field}><option value="needs-information">Request an update or clarification</option><option value="reviewed">Review recorded; follow-up documented below</option></select></label>}<label className="block text-sm font-medium">Private review note<textarea name="note" required maxLength={6000} rows={5} className={field}/></label><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name="independent" required className="mt-1"/>I am disinterested in the disclosed matters and have reviewed this signed revision. If implicated, I will route it to another director instead.</label><button disabled={busy} className={button}>{isReviewer ? "Record review" : "Retain counsel’s advice"}</button></form></Surface>}
    {view.events.some((event) => event.kind !== "submission") && <Surface className="p-6"><h2 className="text-xl font-semibold">Private review history</h2><ul className="mt-4 space-y-5">{view.events.map((event, index) => event.kind !== "submission" ? <li key={index} className="border-t border-[var(--border)] pt-4"><p className="text-sm font-semibold">{event.actor.name} · {event.outcome} · signed revision {event.revision}</p><p className="mt-1 text-xs text-[var(--muted)]">{event.at}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{event.note}</p></li> : null)}</ul></Surface>}
    <Surface className="p-6"><details><summary className="cursor-pointer text-lg font-semibold">Change the review assignment / recuse</summary><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Use this when a reviewer is implicated or cannot serve. Anyone removed from the assignment loses access. You may retain an existing reviewer when changing only the other role, or explicitly invite counsel. Removed reviewers cannot be re-added through this flow. The new group can see signed history; only the subject can see drafts.</p><form onSubmit={route} className="mt-5 space-y-5"><label className="block text-sm font-medium">Reviewing director<select name="reviewerId" defaultValue={request.reviewer.accessId} required className={field}><option value="">Choose another disinterested director</option>{candidates.filter((person) => !unavailable.has(person.accessId) && disclosureDirector(person.role)).map((person) => <option key={person.accessId} value={person.accessId}>{person.name}</option>)}</select></label><label className="block text-sm font-medium">Explicitly invited counsel (optional)<select name="counselId" defaultValue={request.counsel?.accessId ?? ""} className={field}><option value="">No counsel invited</option>{candidates.filter((person) => !unavailable.has(person.accessId) && person.role === "legal-counsel").map((person) => <option key={person.accessId} value={person.accessId}>{person.name}</option>)}</select></label><label className="block text-sm font-medium">Private reason for routing<textarea name="note" required maxLength={2000} rows={3} className={field}/></label><button disabled={busy} className={secondary}>Replace review assignment</button></form></details></Surface>
  </div>;
}
