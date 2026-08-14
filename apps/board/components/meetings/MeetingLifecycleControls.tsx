"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Surface } from "@pgpz/ui";
import { Bell, Check, FileCheck2, LoaderCircle } from "lucide-react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { MeetingCapabilities, MeetingStatus, MeetingSummaryView } from "./types";

const nextStatus: Partial<Record<MeetingStatus, { value: MeetingStatus; label: string }>> = {
  draft: { value: "scheduled", label: "Schedule meeting" },
  scheduled: { value: "materials-published", label: "Publish materials" },
  "materials-published": { value: "completed", label: "Mark completed" },
  completed: { value: "closed", label: "Close meeting record" },
};

export function MeetingLifecycleControls({ meeting, capabilities, deliveryCount, quorumEligibleAttended }: { meeting: MeetingSummaryView; capabilities: MeetingCapabilities; deliveryCount: number; quorumEligibleAttended: number }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const communicationOptions = meeting.status === "scheduled"
    ? [{ value: "send-invitation", label: "Invitation" }, { value: "send-update", label: "Meeting update" }, { value: "send-reminder", label: "Reminder" }]
    : meeting.status === "materials-published"
      ? [{ value: "send-materials-ready", label: "Materials ready" }, { value: "send-update", label: "Meeting update" }, { value: "send-reminder", label: "Reminder" }]
      : meeting.status === "cancelled"
        ? [{ value: "send-cancellation", label: "Cancellation" }]
        : [];
  const [communicationAction, setCommunicationAction] = useState(communicationOptions[0]?.value || "");
  const communicationId = useRef<string | null>(null);
  useEffect(() => {
    setCommunicationAction(communicationOptions[0]?.value || "");
    communicationId.current = null;
  // The available official messages change when the retained lifecycle state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.status]);
  const transition = nextStatus[meeting.status];

  async function post(body: Record<string, unknown>, success: string) {
    setPending(String(body.action));
    setMessage(null);
    try {
      const response = await fetchWithBoardStepUp("/api/meetings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("The update could not be saved.");
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The update could not be saved.");
    } finally {
      setPending(null);
    }
  }

  async function sendCommunication() {
    if (!communicationAction) return;
    communicationId.current ||= crypto.randomUUID();
    setPending("communication");
    setMessage(null);
    try {
      const response = await fetchWithBoardStepUp(`/api/meetings/${encodeURIComponent(meeting.id)}/communications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: communicationAction, expectedVersion: meeting.version, communicationId: communicationId.current }),
      });
      const result = await response.json().catch(() => ({})) as { failedCount?: number; sentCount?: number; skippedCount?: number; error?: string };
      if (!response.ok || result.failedCount) throw new Error(result.error || "Some recipients could not be reached. Retry to send only to those recipients.");
      communicationId.current = null;
      setMessage(`Meeting message processed for ${(result.sentCount || 0) + (result.skippedCount || 0)} recipients.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The meeting message could not be sent.");
    } finally {
      setPending(null);
    }
  }

  async function cancelMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post({ action: "setStatus", meetingId: meeting.id, status: "cancelled", cancellationReason: String(form.get("reason") || ""), expectedVersion: meeting.version }, "Meeting cancelled. Send a cancellation message to notify attendees.");
  }

  return (
    <Surface className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Meeting tools</h2>
      <div className="mt-4 grid gap-2">
        {capabilities.canManage && transition ? (
          <button type="button" disabled={pending !== null} onClick={() => post({ action: "setStatus", meetingId: meeting.id, status: transition.value, expectedVersion: meeting.version }, `${transition.label} complete.`)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
            {pending === "setStatus" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}{transition.label}
          </button>
        ) : null}
        {capabilities.canManage && communicationOptions.length > 0 ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <label className="sr-only" htmlFor={`communication-${meeting.id}`}>Meeting message</label>
            <select id={`communication-${meeting.id}`} value={communicationAction} onChange={(event) => setCommunicationAction(event.target.value)} className="min-w-0 rounded-full border border-[var(--border-strong)] bg-white px-3 py-2 text-xs font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
              {communicationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button type="button" disabled={pending !== null} onClick={sendCommunication} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
              {pending === "communication" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />} Send
            </button>
          </div>
        ) : null}
        {capabilities.canManage && meeting.quorumRequired ? (
          <button type="button" disabled={pending !== null || (!meeting.quorumConfirmedAt && quorumEligibleAttended < meeting.quorumRequired)} onClick={() => post({ action: "confirmQuorum", meetingId: meeting.id, confirmed: !meeting.quorumConfirmedAt, expectedVersion: meeting.version }, meeting.quorumConfirmedAt ? "Quorum confirmation cleared." : "Quorum confirmed.")} className="rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
            {meeting.quorumConfirmedAt ? "Clear quorum confirmation" : `Confirm quorum (${quorumEligibleAttended}/${meeting.quorumRequired})`}
          </button>
        ) : null}
        {capabilities.canManage && ["draft", "scheduled", "materials-published"].includes(meeting.status) ? (
          <details className="rounded-2xl border border-[var(--border)] bg-white">
            <summary className="cursor-pointer list-none px-4 py-2.5 text-center text-xs font-semibold text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] [&::-webkit-details-marker]:hidden">Cancel meeting</summary>
            <form onSubmit={cancelMeeting} className="border-t border-[var(--border)] p-3">
              <label className="text-xs font-semibold text-[var(--foreground)]">Reason<input name="reason" required maxLength={500} className="mt-1.5 w-full rounded-xl border border-[var(--border-strong)] px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
              <button type="submit" disabled={pending !== null} className="mt-3 w-full rounded-full border border-red-300 px-3 py-2 text-xs font-semibold text-red-800 transition hover:bg-red-50 disabled:opacity-60">Confirm cancellation</button>
            </form>
          </details>
        ) : null}
        {capabilities.canPrepare ? (
          <a href="#minutes" className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><FileCheck2 className="h-4 w-4" aria-hidden="true" /> Prepare records</a>
        ) : null}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{deliveryCount > 0 ? `${deliveryCount} delivery ${deliveryCount === 1 ? "attempt" : "attempts"} recorded.` : "No meeting communications sent yet."}</p>
      <p aria-live="polite" className="mt-2 text-xs font-semibold text-[var(--foreground)]">{message}</p>
    </Surface>
  );
}
