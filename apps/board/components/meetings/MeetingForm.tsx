"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { MeetingFormat, MeetingSummaryView, MeetingType } from "./types";

function localDateTimeValue(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const fieldClass = "mt-1.5 w-full rounded-2xl border border-[var(--border-strong)] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[color-mix(in_srgb,var(--muted)_70%,transparent)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]";

export function MeetingForm({ meeting }: { meeting?: MeetingSummaryView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<MeetingFormat>(meeting?.format || "live");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const startValue = String(form.get("startAt") || "");
    const endValue = String(form.get("endAt") || "");
    const fields = {
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      type: String(form.get("type") || "regular") as MeetingType,
      format: String(form.get("format") || "live") as MeetingFormat,
      startAt: new Date(startValue).toISOString(),
      endAt: new Date(endValue).toISOString(),
      timeZone: String(form.get("timeZone") || "America/New_York"),
      location: String(form.get("location") || ""),
      virtualUrl: String(form.get("virtualUrl") || "") || null,
      quorumRequired: Number(form.get("quorumRequired") || 0) || null,
    };
    try {
      const response = await fetchWithBoardStepUp("/api/meetings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(meeting
          ? { action: "update", meetingId: meeting.id, expectedVersion: meeting.version, ...fields }
          : { action: "create", ...fields }),
      });
      const payload = await response.json().catch(() => ({})) as { id?: string; meeting?: { id?: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "The meeting could not be saved.");
      const id = meeting?.id || payload.meeting?.id || payload.id;
      router.push(id ? `/meetings/${encodeURIComponent(id)}` : "/meetings");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The meeting could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <label className="text-sm font-semibold text-[var(--foreground)]">
          Meeting title
          <input name="title" required maxLength={160} defaultValue={meeting?.title} placeholder="Regular Board meeting" className={fieldClass} />
        </label>
        <label className="text-sm font-semibold text-[var(--foreground)]">
          Meeting type
          <select name="type" defaultValue={meeting?.type || "regular"} className={fieldClass}>
            <option value="regular">Regular</option><option value="special">Special</option><option value="annual">Annual</option><option value="committee">Committee</option><option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="text-sm font-semibold text-[var(--foreground)]">
        Meeting format
        <select name="format" value={format} onChange={(event) => setFormat(event.target.value as MeetingFormat)} className={fieldClass}>
          <option value="live">Live meeting</option>
          <option value="asynchronous">Asynchronous written resolution</option>
        </select>
        <span className="mt-2 block text-xs font-normal leading-5 text-[var(--muted)]">{format === "asynchronous" ? "Directors review materials and cast authenticated votes during a defined window; no video or physical meeting is required." : "Directors convene at a scheduled time, in person or online."}</span>
      </label>
      <label className="text-sm font-semibold text-[var(--foreground)]">
        Purpose or description
        <textarea name="description" rows={3} maxLength={1200} defaultValue={meeting?.description} placeholder="What the Board will cover and what members should prepare for" className={fieldClass} />
      </label>
      <label className="text-sm font-semibold text-[var(--foreground)]">
        {format === "asynchronous" ? "Default participating directors required for quorum" : "Directors required for quorum"} <span className="font-normal text-[var(--muted)]">(optional)</span>
        <input name="quorumRequired" type="number" min="1" max="100" defaultValue={meeting?.quorumRequired || ""} placeholder="Set from the bylaws" className={fieldClass} />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[var(--foreground)]">{format === "asynchronous" ? "Voting opens" : "Starts"}<input name="startAt" type="datetime-local" required defaultValue={localDateTimeValue(meeting?.startAt)} className={fieldClass} /></label>
        <label className="text-sm font-semibold text-[var(--foreground)]">{format === "asynchronous" ? "Voting closes" : "Ends"}<input name="endAt" type="datetime-local" required defaultValue={localDateTimeValue(meeting?.endAt)} className={fieldClass} /></label>
      </div>
      <label className="text-sm font-semibold text-[var(--foreground)]">
        Time zone
        <select name="timeZone" defaultValue={meeting?.timeZone || "America/New_York"} className={fieldClass}>
          <option value="America/New_York">Eastern time</option><option value="America/Chicago">Central time</option><option value="America/Denver">Mountain time</option><option value="America/Los_Angeles">Pacific time</option><option value="UTC">UTC</option>
        </select>
      </label>
      {format === "live" ? <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[var(--foreground)]">Location<input name="location" maxLength={240} defaultValue={meeting?.location || ""} placeholder="Office, conference room, or online" className={fieldClass} /></label>
        <label className="text-sm font-semibold text-[var(--foreground)]">Video meeting link<input name="virtualUrl" type="url" maxLength={500} defaultValue={meeting?.virtualUrl || ""} placeholder="https://…" className={fieldClass} /></label>
      </div> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-6">
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{meeting ? "Save changes" : "Create draft meeting"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-full px-4 py-2.5 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">Cancel</button>
        <p aria-live="polite" className="w-full text-sm font-semibold text-red-800">{error}</p>
      </div>
    </form>
  );
}
