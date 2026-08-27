"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Surface } from "@pgpz/ui";
import { Bell, Check, Gavel, LoaderCircle, LockKeyhole, Plus } from "lucide-react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { AsyncBallotView, AsyncVoteChoice, MeetingSummaryView } from "./types";
import { BallotDiscussion } from "./BallotDiscussion";

const fieldClass = "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]";

const statusLabels: Record<AsyncBallotView["effectiveStatus"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  open: "Voting open",
  "awaiting-finalization": "Voting closed · result pending",
  closed: "Final",
  cancelled: "Cancelled",
};

export function AsyncBallots({ meeting, ballots, canManage, canDiscuss }: { meeting: MeetingSummaryView; ballots: AsyncBallotView[]; canManage: boolean; canDiscuss: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const communicationIds = useRef<Record<string, string>>({});

  async function post(body: Record<string, unknown>, success: string) {
    setPending(`${String(body.action)}:${String(body.ballotId || "new")}`);
    setMessage(null);
    try {
      const response = await fetchWithBoardStepUp(`/api/meetings/${encodeURIComponent(meeting.id)}/ballots`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The ballot action could not be completed.");
      setMessage(success);
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The ballot action could not be completed.");
      return false;
    } finally {
      setPending(null);
    }
  }

  async function createBallot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await post({
      action: "saveBallot", expectedVersion: meeting.version,
      title: String(data.get("title") || ""), motion: String(data.get("motion") || ""),
      quorumRequired: String(data.get("quorumRequired") || "") || null,
      approvalRequired: String(data.get("approvalRequired") || "") || null,
    }, "Draft ballot added.");
    if (saved) form.reset();
  }

  async function castVote(event: FormEvent<HTMLFormElement>, ballot: AsyncBallotView) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const choice = String(data.get("choice") || "") as AsyncVoteChoice;
    await post({ action: "castVote", ballotId: ballot.id, choice }, ballot.viewerChoice ? "Your vote was updated and retained." : "Your vote was cast and retained.");
  }

  async function updateBallot(event: FormEvent<HTMLFormElement>, ballot: AsyncBallotView) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await post({
      action: "saveBallot", ballotId: ballot.id, expectedVersion: meeting.version,
      title: String(data.get("title") || ""), motion: String(data.get("motion") || ""),
      quorumRequired: String(data.get("quorumRequired") || "") || null,
      approvalRequired: String(data.get("approvalRequired") || "") || null,
    }, "Draft ballot updated.");
  }

  async function cancelBallot(event: FormEvent<HTMLFormElement>, ballot: AsyncBallotView) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await post({ action: "cancelBallot", ballotId: ballot.id, expectedVersion: meeting.version, reason: String(data.get("reason") || "") }, "Ballot cancelled; existing evidence was retained.");
    if (saved) form.reset();
  }

  async function sendVoteReminder(ballot: AsyncBallotView) {
    communicationIds.current[ballot.id] ||= crypto.randomUUID();
    setPending(`reminder:${ballot.id}`);
    setMessage(null);
    try {
      const response = await fetchWithBoardStepUp(`/api/meetings/${encodeURIComponent(meeting.id)}/communications`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send-vote-reminder", ballotId: ballot.id, expectedVersion: meeting.version, communicationId: communicationIds.current[ballot.id] }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; sentCount?: number; skippedCount?: number; failedCount?: number };
      if (!response.ok || result.failedCount) throw new Error(result.error || "Some vote reminders could not be delivered. Retry to send only failed deliveries.");
      delete communicationIds.current[ballot.id];
      setMessage(`Vote reminder processed for ${(result.sentCount || 0) + (result.skippedCount || 0)} outstanding directors.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vote reminders could not be sent.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Surface className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Gavel className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">Written resolutions and voting</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Votes are attributable in retained governance records. Live totals and individual choices remain hidden; only final aggregate results are shown.</p>
        </div>
      </div>

      {ballots.length === 0 ? <p className="mt-5 rounded-2xl bg-[var(--surface-muted)] px-4 py-5 text-sm text-[var(--muted)]">No written resolutions have been prepared.</p> : (
        <ol className="mt-5 grid gap-4">
          {ballots.map((ballot) => {
            const canFinalize = canManage && ballot.effectiveStatus === "awaiting-finalization";
            return (
              <li key={ballot.id} className="rounded-2xl border border-[var(--border)] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">{statusLabels[ballot.effectiveStatus]}</span>
                      {ballot.effectiveStatus !== "draft" && ballot.effectiveStatus !== "cancelled" ? <span className="text-xs font-semibold text-[var(--muted)]">{ballot.ballotsCast} of {ballot.eligibleCount} responses</span> : null}
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-[var(--foreground)]">{ballot.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{ballot.motion}</p>
                    {ballot.quorumRequired && ballot.approvalRequired ? <p className="mt-3 text-xs font-medium text-[var(--muted)]">Requires {ballot.quorumRequired} participating director{ballot.quorumRequired === 1 ? "" : "s"} for quorum and {ballot.approvalRequired} yes vote{ballot.approvalRequired === 1 ? "" : "s"} for approval.</p> : null}
                  </div>
                  {ballot.result ? (
                    <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-right">
                      <p className="text-sm font-bold capitalize text-[var(--foreground)]">{ballot.result.outcome.replace("-", " ")}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">Yes {ballot.result.yes} · No {ballot.result.no} · Abstain {ballot.result.abstain}{ballot.result.recused ? ` · Recused ${ballot.result.recused}` : ""}</p>
                    </div>
                  ) : null}
                </div>

                {ballot.viewerEligible && (ballot.effectiveStatus === "open") ? (
                  <form className="mt-5 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4" onSubmit={(event) => castVote(event, ballot)}>
                    <fieldset>
                      <legend className="text-sm font-semibold text-[var(--foreground)]">{ballot.viewerChoice ? "Your retained vote" : "Cast your vote"}</legend>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(["yes", "no", "abstain", "recused"] as const).map((choice) => <label key={choice} className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm font-semibold capitalize"><input type="radio" name="choice" value={choice} required defaultChecked={ballot.viewerChoice === choice} />{choice}</label>)}
                      </div>
                    </fieldset>
                    <button type="submit" disabled={pending !== null} className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending === `castVote:${ballot.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}{ballot.viewerChoice ? "Update vote" : "Submit vote"}</button>
                    <p className="mt-2 text-xs text-[var(--muted)]">You may change your response until voting closes. Every submission is retained in the audit history.</p>
                  </form>
                ) : ballot.viewerEligible && ballot.effectiveStatus === "scheduled" ? <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-3 py-3 text-sm text-[var(--muted)]">Voting opens at the beginning of the window shown in Meeting details.</p> : null}

                <BallotDiscussion meetingId={meeting.id} ballot={ballot} canDiscuss={canDiscuss} timeZone={meeting.timeZone} />

                {canManage ? <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                  {ballot.effectiveStatus === "draft" && meeting.status === "draft" ? <details className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[var(--foreground)]">Edit draft ballot</summary><form className="grid gap-3 border-t border-[var(--border)] bg-white p-3" onSubmit={(event) => updateBallot(event, ballot)}><label className="text-xs font-semibold">Resolution title<input name="title" required defaultValue={ballot.title} className={fieldClass} /></label><label className="text-xs font-semibold">Exact motion<textarea name="motion" required rows={3} defaultValue={ballot.motion} className={fieldClass} /></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Quorum<input name="quorumRequired" type="number" min="1" defaultValue={ballot.quorumRequired || ""} className={fieldClass} /></label><label className="text-xs font-semibold">Yes votes required<input name="approvalRequired" type="number" min="1" defaultValue={ballot.approvalRequired || ""} className={fieldClass} /></label></div><button type="submit" disabled={pending !== null} className="w-fit rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white">Save draft</button></form></details> : null}
                  {ballot.effectiveStatus === "draft" && (meeting.status === "scheduled" || meeting.status === "materials-published") ? <button type="button" disabled={pending !== null} onClick={() => post({ action: "openBallot", ballotId: ballot.id, expectedVersion: meeting.version }, "Ballot opened with the current active director roster.")} className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white"><Check className="h-4 w-4" aria-hidden="true" />Open ballot</button> : null}
                  {ballot.effectiveStatus === "open" && ballot.ballotsCast < ballot.eligibleCount ? <button type="button" disabled={pending !== null} onClick={() => sendVoteReminder(ballot)} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-xs font-semibold text-[var(--foreground)]"><Bell className="h-4 w-4" aria-hidden="true" />Remind outstanding voters</button> : null}
                  {canFinalize ? <button type="button" disabled={pending !== null} onClick={() => post({ action: "finalizeBallot", ballotId: ballot.id, expectedVersion: meeting.version }, "Final aggregate result retained.")} className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white"><Check className="h-4 w-4" aria-hidden="true" />Finalize result</button> : null}
                  {(ballot.effectiveStatus === "draft" || ballot.effectiveStatus === "scheduled" || ballot.effectiveStatus === "open") ? <details className="ml-auto"><summary className="cursor-pointer text-xs font-semibold text-red-800">Cancel ballot</summary><form className="mt-2 flex gap-2" onSubmit={(event) => cancelBallot(event, ballot)}><input name="reason" required placeholder="Reason" className={fieldClass} /><button type="submit" className="rounded-full border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800">Confirm</button></form></details> : null}
                </div> : null}
              </li>
            );
          })}
        </ol>
      )}

      {canManage && meeting.status === "draft" ? (
        <details className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--foreground)]"><Plus className="h-4 w-4" aria-hidden="true" />Add written resolution</summary>
          <form className="grid gap-4 border-t border-[var(--border)] bg-white p-4" onSubmit={createBallot}>
            <label className="text-xs font-semibold">Resolution title<input name="title" required maxLength={200} className={fieldClass} /></label>
            <label className="text-xs font-semibold">Exact motion or resolution<textarea name="motion" required rows={4} maxLength={4000} className={fieldClass} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">Quorum required <span className="font-normal text-[var(--muted)]">(optional)</span><input name="quorumRequired" type="number" min="1" placeholder="Default: meeting quorum or majority" className={fieldClass} /></label>
              <label className="text-xs font-semibold">Yes votes required <span className="font-normal text-[var(--muted)]">(optional)</span><input name="approvalRequired" type="number" min="1" placeholder="Default: majority of directors" className={fieldClass} /></label>
            </div>
            <p className="text-xs leading-5 text-[var(--muted)]">Confirm these thresholds against the bylaws or applicable written-consent rule. They become fixed when the ballot opens.</p>
            <button type="submit" disabled={pending !== null} className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden="true" />Add draft ballot</button>
          </form>
        </details>
      ) : null}
      <p aria-live="polite" className="mt-4 text-sm font-semibold text-[var(--foreground)]">{message}</p>
    </Surface>
  );
}
