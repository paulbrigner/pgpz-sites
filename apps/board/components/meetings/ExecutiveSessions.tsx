"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";

const input = "mt-2 block w-full rounded-xl border border-[var(--border-strong)] bg-white p-3 text-sm";
const button = "rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
export type ExecutiveCandidate = { id: string; name: string; email: string; kind: "director" | "counsel" };

export function ExecutiveSessions({ meetingId, sessions, candidates }: {
  meetingId: string;
  sessions: { id: string; title: string; status: "open" | "closed" }[];
  candidates: ExecutiveCandidate[] | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [facilitatorId, setFacilitator] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  if (!sessions.length && !candidates) return null;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true); setMessage("");
    try {
      const response = await fetchWithBoardStepUp(`/api/meetings/${encodeURIComponent(meetingId)}/executive-sessions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: data.get("title"), purpose: data.get("purpose"), participantIds: selected, facilitatorId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create the session.");
      if (result.participating) router.push(`/meetings/${encodeURIComponent(meetingId)}/executive-sessions/${encodeURIComponent(result.id)}`);
      else { form.reset(); setSelected([]); setFacilitator(""); setMessage("Session created. You are excluded and cannot enter it. Selected participants can open it from this meeting."); router.refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create the session."); }
    finally { setPending(false); }
  }

  return <section className="mt-8 rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-7" aria-labelledby="executive-sessions-heading">
    <h2 id="executive-sessions-heading" className="text-xl font-semibold">Executive sessions</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Private workspaces for selected directors and explicitly invited Legal Counsel. Only sessions you may enter are listed.</p>
    <ul className="mt-4 space-y-3">{sessions.map((session) => <li key={session.id}>
      <Link prefetch={false} className="font-semibold text-[var(--primary)] underline" href={`/meetings/${encodeURIComponent(meetingId)}/executive-sessions/${encodeURIComponent(session.id)}`}>{session.title}</Link>
      <span className="ml-3 text-sm">{session.status === "open" ? "Open for deliberation" : "Closed · retained record"}</span>
    </li>)}</ul>
    {candidates && <details className="mt-5 rounded-xl border border-[var(--border)] p-4">
      <summary className="cursor-pointer font-semibold">Open an executive session</summary>
      <form onSubmit={create} className="mt-5 space-y-5">
        <label className="block text-sm font-medium">Private title<input name="title" required maxLength={200} className={input} /></label>
        <label className="block text-sm font-medium">Private purpose and exclusions<textarea name="purpose" required maxLength={4000} rows={3} className={input} placeholder="Describe the matter, any conflicts, and who must be excluded from deliberations." /></label>
        <fieldset><legend className="text-sm font-semibold">Select every participant explicitly</legend>
          <p className="mt-1 text-sm text-[var(--muted)]">Unchecked directors, the Executive Director, and Board Support cannot enter. Exclude yourself if you are recused. Legal Counsel may advise but does not vote here.</p>
          <div className="mt-3 space-y-3">{candidates.map((person) => <label key={person.id} className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={selected.includes(person.id)} onChange={(event) => {
              setSelected(event.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id));
              if (!event.target.checked && facilitatorId === person.id) setFacilitator("");
            }} />
            <span>{person.name || person.email} <span className="text-[var(--muted)]">({person.kind === "counsel" ? "Legal Counsel · explicit invitation" : "Director"})</span></span>
          </label>)}</div>
        </fieldset>
        <label className="block text-sm font-medium">Facilitating director<select required value={facilitatorId} onChange={(event) => setFacilitator(event.target.value)} className={input}>
          <option value="">Choose a selected director</option>
          {candidates.filter((p) => p.kind === "director" && selected.includes(p.id)).map((p) => <option value={p.id} key={p.id}>{p.name || p.email}</option>)}
        </select></label>
        <p className="text-sm text-[var(--muted)]">The participant list is fixed when opened. Use a new session for a different group. Participants find this workspace on the meeting page; opening it does not send email. Share its link only with selected participants.</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="mt-1" />I have reviewed the participants and exclusions. This workspace is for deliberation; formal Board approval is recorded separately.</label>
        <button className={button} disabled={pending || !facilitatorId}>{pending ? "Opening…" : "Open restricted session"}</button>
      </form>
    </details>}
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
  </section>;
}
