"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LoaderCircle, Plus, Upload } from "lucide-react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { MeetingMaterialView, MeetingSummaryView } from "./types";

const inputClass = "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]";
const detailClass = "group rounded-2xl border border-[var(--border)] bg-white open:border-[var(--border-strong)]";
const summaryClass = "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] [&::-webkit-details-marker]:hidden";

export function buildMeetingDocumentCreatePayload(input: {
  stagingKey: string;
  fileName: string;
  title: string;
  description: string;
  meetingId: string;
  meetingSection: string;
}) {
  return {
    action: "create",
    stagingKey: input.stagingKey,
    fileName: input.fileName,
    title: input.title,
    description: input.description,
    category: "meeting-records",
    ownerType: "meeting",
    meetingId: input.meetingId,
    meetingSection: input.meetingSection || "preparation",
  } as const;
}

export function MeetingRecordsManager({ meeting, agendaCount, materials, canManage, canPrepare, canManageDocuments }: { meeting: MeetingSummaryView; agendaCount: number; materials: MeetingMaterialView[]; canManage: boolean; canPrepare: boolean; canManageDocuments: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [minutesStatus, setMinutesStatus] = useState(meeting.minutesStatus);

  async function submitMeetingAction(event: FormEvent<HTMLFormElement>, action: string, transform?: (data: FormData) => Record<string, unknown>) {
    event.preventDefault();
    setPending(action);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = transform ? transform(data) : Object.fromEntries(data.entries());
    try {
      const response = await fetchWithBoardStepUp("/api/meetings", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, meetingId: meeting.id, expectedVersion: meeting.version, ...body }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The meeting record could not be saved.");
      form.reset();
      setMessage("Meeting record saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The meeting record could not be saved.");
    } finally {
      setPending(null);
    }
  }

  async function uploadMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("document");
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    try {
      if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
      const prepared = await fetchWithBoardStepUp("/api/documents", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "prepareUpload" }),
      });
      const upload = await prepared.json().catch(() => ({})) as { stagingKey?: string; uploadUrl?: string; error?: string };
      if (!prepared.ok || !upload.stagingKey || !upload.uploadUrl) throw new Error(upload.error || "The upload could not be prepared.");
      const uploaded = await fetch(upload.uploadUrl, { method: "PUT", body: file });
      if (!uploaded.ok) throw new Error("The file could not be uploaded.");
      const created = await fetchWithBoardStepUp("/api/documents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(buildMeetingDocumentCreatePayload({
          stagingKey: upload.stagingKey,
          fileName: file.name,
          title: String(data.get("title") || ""),
          description: String(data.get("description") || ""),
          meetingId: meeting.id,
          meetingSection: String(data.get("meetingSection") || "preparation"),
        })),
      });
      const result = await created.json().catch(() => ({})) as { error?: string };
      if (!created.ok) throw new Error(result.error || "The meeting document could not be retained.");
      form.reset();
      setMessage("Meeting document added to the governance vault.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The meeting document could not be added.");
    } finally {
      setPending(null);
    }
  }

  async function uploadVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("document-version");
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    const documentId = String(data.get("documentId") || "");
    try {
      if (!documentId) throw new Error("Choose a meeting document.");
      if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
      const prepared = await fetchWithBoardStepUp("/api/documents", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "prepareUpload" }),
      });
      const upload = await prepared.json().catch(() => ({})) as { stagingKey?: string; uploadUrl?: string; error?: string };
      if (!prepared.ok || !upload.stagingKey || !upload.uploadUrl) throw new Error(upload.error || "The upload could not be prepared.");
      const uploaded = await fetch(upload.uploadUrl, { method: "PUT", body: file });
      if (!uploaded.ok) throw new Error("The file could not be uploaded.");
      const added = await fetchWithBoardStepUp("/api/documents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "addVersion", documentId, stagingKey: upload.stagingKey, fileName: file.name }),
      });
      const result = await added.json().catch(() => ({})) as { error?: string };
      if (!added.ok) throw new Error(result.error || "The new version could not be retained.");
      form.reset();
      setMessage("New document version retained in the governance vault.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The new version could not be added.");
    } finally {
      setPending(null);
    }
  }

  const submitButton = (label: string, action: string) => (
    <button type="submit" disabled={pending !== null} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
      {pending === action ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}{label}
    </button>
  );

  return (
    <section className="rounded-3xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5 sm:p-6" aria-labelledby="prepare-meeting-records">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-ink)]">Preparation tools</p>
        <h2 id="prepare-meeting-records" className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">Prepare meeting records</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{canPrepare ? "Add working records here. Official lifecycle changes remain with the Chair or Executive Director." : "Add and update governed documents associated only with this meeting."}</p>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {canPrepare ? <>
        <details className={detailClass}>
          <summary className={summaryClass}>Agenda item <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
          <form className="border-t border-[var(--border)] p-4" onSubmit={(event) => submitMeetingAction(event, "upsertAgendaItem", (data) => ({
            title: String(data.get("title") || ""), description: String(data.get("description") || ""), kind: String(data.get("kind") || "discussion"), presenter: String(data.get("presenter") || ""), allottedMinutes: Number(data.get("allottedMinutes") || 0) || null, order: agendaCount,
          }))}>
            <label className="text-xs font-semibold">Title<input name="title" required maxLength={200} className={inputClass} /></label>
            <label className="mt-3 block text-xs font-semibold">Description<textarea name="description" rows={2} maxLength={1000} className={inputClass} /></label>
            <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Purpose<select name="kind" className={inputClass}><option value="information">Information</option><option value="discussion">Discussion</option><option value="decision">Decision</option><option value="consent">Consent</option></select></label><label className="text-xs font-semibold">Minutes<input name="allottedMinutes" type="number" min="0" max="480" className={inputClass} /></label></div>
            <label className="mt-3 block text-xs font-semibold">Lead or presenter<input name="presenter" maxLength={160} className={inputClass} /></label>
            {submitButton("Add agenda item", "upsertAgendaItem")}
          </form>
        </details>
        </> : null}
        {canManageDocuments ? <>
        <details className={detailClass}>
          <summary className={summaryClass}>Meeting document <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
          <form className="border-t border-[var(--border)] p-4" onSubmit={uploadMaterial}>
            <label className="text-xs font-semibold">Display title<input name="title" required maxLength={200} className={inputClass} /></label>
            <label className="mt-3 block text-xs font-semibold">Description<input name="description" maxLength={1000} className={inputClass} /></label>
            <label className="mt-3 block text-xs font-semibold">Section<select name="meetingSection" className={inputClass}><option value="preparation">Preparation materials</option><option value="agenda">Agenda</option><option value="resolution">Resolution</option><option value="minutes">Minutes</option><option value="other">Other</option></select></label>
            <label className="mt-3 block text-xs font-semibold">File<input name="file" type="file" required className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-[var(--primary-soft)] file:px-3 file:py-1 file:text-xs file:font-semibold`} /></label>
            <button type="submit" disabled={pending !== null} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Upload className="h-4 w-4" aria-hidden="true" />{pending === "document" ? "Uploading…" : "Add document"}</button>
          </form>
        </details>
        {materials.length > 0 ? (
          <details className={detailClass}>
            <summary className={summaryClass}>New document version <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
            <form className="border-t border-[var(--border)] p-4" onSubmit={uploadVersion}>
              <label className="text-xs font-semibold">Meeting document<select name="documentId" required defaultValue="" className={inputClass}><option value="" disabled>Select a document</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              <label className="mt-3 block text-xs font-semibold">Replacement file<input name="file" type="file" required className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-[var(--primary-soft)] file:px-3 file:py-1 file:text-xs file:font-semibold`} /></label>
              <button type="submit" disabled={pending !== null} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Upload className="h-4 w-4" aria-hidden="true" />{pending === "document-version" ? "Uploading…" : "Add version"}</button>
            </form>
          </details>
        ) : null}
        </> : null}
        {canPrepare ? <>
        <details className={detailClass}>
          <summary className={summaryClass}>Attendance <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
          <form className="border-t border-[var(--border)] p-4" onSubmit={(event) => submitMeetingAction(event, "recordAttendance", (data) => ({ name: String(data.get("name") || ""), email: String(data.get("email") || ""), status: String(data.get("status") || "attended"), quorumEligible: data.get("quorumEligible") === "on" }))}>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Name<input name="name" required className={inputClass} /></label><label className="text-xs font-semibold">Email<input name="email" type="email" required className={inputClass} /></label></div>
            <label className="mt-3 block text-xs font-semibold">Status<select name="status" className={inputClass}><option value="attended">Attended</option><option value="absent">Absent</option><option value="accepted">Accepted</option><option value="tentative">Tentative</option><option value="declined">Declined</option><option value="invited">Invited</option></select></label>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold"><input name="quorumEligible" type="checkbox" defaultChecked /> Eligible for quorum</label>
            {submitButton("Record attendance", "recordAttendance")}
          </form>
        </details>

        {canManage ? <details className={detailClass}>
          <summary className={summaryClass}>Decision or vote <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
          <form className="border-t border-[var(--border)] p-4" onSubmit={(event) => submitMeetingAction(event, "recordDecision", (data) => ({ title: String(data.get("title") || ""), motion: String(data.get("motion") || ""), outcome: String(data.get("outcome") || "passed"), yes: Number(data.get("yes") || 0), no: Number(data.get("no") || 0), abstain: Number(data.get("abstain") || 0), recused: Number(data.get("recused") || 0) }))}>
            <label className="text-xs font-semibold">Decision title<input name="title" required className={inputClass} /></label>
            <label className="mt-3 block text-xs font-semibold">Exact motion or resolution<textarea name="motion" required rows={2} className={inputClass} /></label>
            <label className="mt-3 block text-xs font-semibold">Outcome<select name="outcome" className={inputClass}><option value="passed">Passed</option><option value="failed">Failed</option><option value="tabled">Tabled</option><option value="withdrawn">Withdrawn</option></select></label>
            <div className="mt-3 grid grid-cols-4 gap-2">{["yes", "no", "abstain", "recused"].map((name) => <label key={name} className="text-[0.65rem] font-semibold capitalize">{name}<input name={name} type="number" min="0" defaultValue="0" className={inputClass} /></label>)}</div>
            {submitButton("Record decision", "recordDecision")}
          </form>
        </details> : null}

        <details className={detailClass}>
          <summary className={summaryClass}>Action item <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
          <form className="border-t border-[var(--border)] p-4" onSubmit={(event) => submitMeetingAction(event, "upsertActionItem", (data) => ({ description: String(data.get("description") || ""), ownerName: String(data.get("ownerName") || ""), dueAt: String(data.get("dueAt") || "") || null, status: "open" }))}>
            <label className="text-xs font-semibold">Action required<textarea name="description" required rows={2} className={inputClass} /></label>
            <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Owner<input name="ownerName" required className={inputClass} /></label><label className="text-xs font-semibold">Due date<input name="dueAt" type="date" className={inputClass} /></label></div>
            {submitButton("Add action item", "upsertActionItem")}
          </form>
        </details>

        <details className={detailClass}>
          <summary className={summaryClass}>Minutes status <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
          <form className="border-t border-[var(--border)] p-4" onSubmit={(event) => submitMeetingAction(event, "setMinutesStatus", (data) => ({ status: String(data.get("status") || "draft"), documentId: String(data.get("documentId") || "") || null }))}>
            <label className="text-xs font-semibold">Status<select name="status" value={minutesStatus} onChange={(event) => setMinutesStatus(event.target.value as typeof minutesStatus)} className={inputClass}><option value="not-started">Not started</option><option value="draft">Draft</option><option value="pending-approval">Pending approval</option><option value="approved" disabled={!canManage}>Approved by the Board</option><option value="amended" disabled={!canManage}>Amended by the Board</option></select></label>
            <label className="mt-3 block text-xs font-semibold">Minutes document<select name="documentId" defaultValue="" className={inputClass}><option value="">Select retained minutes</option>{materials.filter((item) => item.section === "minutes").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            {submitButton(minutesStatus === "approved" ? "Record Board approval" : "Update minutes status", "setMinutesStatus")}
          </form>
        </details>
        </> : null}
      </div>
      <p aria-live="polite" className="mt-4 text-sm font-semibold text-[var(--foreground)]">{message}</p>
    </section>
  );
}
