"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Surface } from "@pgpz/ui";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import { disclosureDirector, disclosureStatus, type DisclosureCandidate, type DisclosureRegisterRow } from "@/lib/disclosures";

const field = "mt-1 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2 text-[var(--foreground)]";
const button = "rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
type Policy = { documentId: string; versionId: string; title: string; sequence: number };
export function DisclosuresIndex({ rows, candidates, policies, actorId, canAssign }: { rows: DisclosureRegisterRow[]; candidates: (DisclosureCandidate & { status: string })[]; policies: Policy[]; actorId: string; canAssign: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [subjectId, setSubjectId] = useState(actorId); const [reviewerId, setReviewerId] = useState(""); const [policyId, setPolicyId] = useState(policies.find((policy) => /conflict.*interest/i.test(policy.title))?.documentId ?? "");
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget); const policy = policies.find((item) => item.documentId === policyId);
    try {
      const response = await fetchWithBoardStepUp("/api/disclosures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId, reviewerId, counselId: data.get("counselId"), kind: data.get("kind"), year: Number(data.get("year")), dueDate: data.get("dueDate"), documentId: policy?.documentId, versionId: policy?.versionId, adoption: data.get("adoption") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setMessage("Disclosure request created. Use Send reminder to email the person, or share the portal link with them."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create the request."); } finally { setBusy(false); }
  }
  async function remind(row: DisclosureRegisterRow) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetchWithBoardStepUp(`/api/disclosures/${row.id}/reminder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: row.version, target: "subject" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setMessage(result.status === "sent" ? "Reminder accepted by the email provider." : "Delivery is uncertain. Check with the recipient before trying again."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send."); } finally { setBusy(false); }
  }
  return <div className="mt-8 space-y-6">
    {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-[var(--primary-soft)] p-4">{message}</p>}
    <Surface className="p-6">
      <h2 className="text-xl font-semibold">{canAssign ? "Disclosure register" : "Disclosures available to you"}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">Directors can see completion status. Only the subject, assigned reviewing director, and explicitly invited counsel can open the private record. A recorded review does not approve a transaction.</p>
      {!rows.length ? <p className="mt-5 text-sm">No disclosure requests yet.</p> : <ul className="mt-4 divide-y divide-[var(--border)]">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div><p className="font-semibold">{row.name} · {row.year} {row.kind === "annual" ? "annual disclosure" : "matter-specific disclosure"}</p><p className="mt-1 text-sm text-[var(--muted)]">{disclosureStatus(row.status)}{row.dueDate ? ` · Due ${row.dueDate}` : ""}{row.revision ? ` · Signed revision ${row.revision}` : ""}</p></div>
        <div className="flex gap-4 text-sm font-semibold">{row.canOpen ? <Link className="underline underline-offset-4" href={`/disclosures/${row.id}`}>Open disclosure</Link> : <span className="text-[var(--muted)]">Restricted</span>}{canAssign && <button type="button" disabled={busy} onClick={() => remind(row)} className="underline underline-offset-4 disabled:opacity-50">Send reminder</button>}</div>
      </li>)}</ul>}
    </Surface>
    <Surface className="p-6"><details><summary className="cursor-pointer text-xl font-semibold">{canAssign ? "Assign a disclosure" : "Start my disclosure"}</summary>
      <p className="mt-3 text-sm text-[var(--muted)]">Choose the exact Conflict of Interest Policy version. Each person signs individually. For annual disclosures, use the same policy and reporting year for the five directors and the Executive Director. An invited person can receive a request before their first sign-in.</p>
      <form onSubmit={create} className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium">Person<select required className={field} value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setReviewerId(""); }}>{candidates.filter((person) => canAssign || person.accessId === actorId).map((person) => <option key={person.accessId} value={person.accessId}>{person.name}{person.status === "invited" ? " (invited)" : ""}</option>)}</select></label>
        <label className="text-sm font-medium">Disclosure type<select name="kind" className={field}><option value="annual">Annual disclosure and acknowledgment</option><option value="matter">Matter-specific disclosure</option></select></label>
        <label className="text-sm font-medium">Reporting year<input name="year" required type="number" min="2020" max="2100" defaultValue={new Date().getFullYear()} className={field}/></label>
        <label className="text-sm font-medium">Requested completion date (optional)<input name="dueDate" type="date" className={field}/></label>
        <label className="text-sm font-medium sm:col-span-2">Policy document<select required value={policyId} onChange={(event) => setPolicyId(event.target.value)} className={field}><option value="">Choose the Conflict of Interest Policy</option>{policies.map((policy) => <option key={policy.documentId} value={policy.documentId}>{policy.title} · v{policy.sequence}</option>)}</select></label>
        <label className="text-sm font-medium">Policy adoption status<select name="adoption" className={field}><option value="proposed">Proposed — acknowledgment takes effect upon adoption</option><option value="adopted">Adopted — confirm this exact version was adopted</option></select></label>
        <label className="text-sm font-medium">Disinterested reviewing director<select required value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className={field}><option value="">Choose a director other than the subject</option>{candidates.filter((person) => person.status === "active" && person.accessId !== subjectId && disclosureDirector(person.role)).map((person) => <option key={person.accessId} value={person.accessId}>{person.name}</option>)}</select></label>
        <label className="text-sm font-medium">Explicitly invited legal counsel (optional)<select name="counselId" className={field}><option value="">No counsel invited</option>{candidates.filter((person) => person.status === "active" && person.accessId !== subjectId && person.role === "legal-counsel").map((person) => <option key={person.accessId} value={person.accessId}>{person.name}</option>)}</select></label>
        <p className="text-sm leading-6 text-[var(--muted)]">The Chair has no automatic right to view private answers. For the Chair’s own disclosure, select another disinterested director. Resolve reviewer conflicts before entering sensitive information.</p>
        <div className="sm:col-span-2"><button disabled={busy || !policies.length} className={button}>Create disclosure request</button><span className="ml-3 text-sm text-[var(--muted)]">Creating a request does not send email.</span></div>
      </form>
    </details></Surface>
  </div>;
}
