"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Surface } from "@pgpz/ui";
import type { MeetingSummaryView } from "./types";

type RsvpStatus = "accepted" | "tentative" | "declined";

export function MeetingRsvp({ meeting, currentStatus }: { meeting: MeetingSummaryView; currentStatus: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<RsvpStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function respond(status: RsvpStatus) {
    setPending(status);
    setMessage(null);
    try {
      const response = await fetch("/api/meetings", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rsvp", meetingId: meeting.id, expectedVersion: meeting.version, status }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Your response could not be saved.");
      setMessage("Response saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your response could not be saved.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Surface className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Your attendance</h2>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-full border border-[var(--border)] bg-white p-1">
        {(["accepted", "tentative", "declined"] as const).map((status) => (
          <button key={status} type="button" aria-pressed={currentStatus === status} disabled={pending !== null} onClick={() => respond(status)} className="rounded-full px-2 py-2 text-xs font-semibold capitalize text-[var(--muted)] transition hover:text-[var(--foreground)] aria-pressed:bg-[var(--primary)] aria-pressed:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">{pending === status ? "Saving…" : status}</button>
        ))}
      </div>
      <p aria-live="polite" className="mt-2 text-xs font-semibold text-[var(--foreground)]">{message}</p>
    </Surface>
  );
}
