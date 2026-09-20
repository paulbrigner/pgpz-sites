"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { actionItemDateInput, type ActionItemChanges } from "@/lib/action-items";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { ActionItemView, MeetingSummaryView } from "./types";

type Editor = { mode: "create" | "edit" | "status"; task?: ActionItemView; status?: ActionItemView["status"] };
const button = "rounded-full border border-[var(--border-strong)] px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-50";
const field = "mt-1 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--foreground)]";
const labels = { open: "Open", completed: "Completed", cancelled: "Cancelled" };

export function MeetingTasks({ meeting, items, canPrepare }: { meeting: MeetingSummaryView; items: ActionItemView[]; canPrepare: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const busy = saving || refreshing;
  const visible = items.filter((item) => filter === "all" || item.status === "open");

  function open(next: Editor) {
    setEditor(next); setDescription(next.task?.title || ""); setOwner(next.task?.owner || "");
    setDueDate(actionItemDateInput(next.task?.dueAt || null, meeting.timeZone)); setNote(""); setError(""); setConflict(false); setMessage("");
  }
  function refresh() { startTransition(() => router.refresh()); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy) return;
    setSaving(true); setError(""); setConflict(false); setMessage("");
    let body: Record<string, unknown>;
    if (editor.mode === "status") body = { action: "setActionItemStatus", actionItemId: editor.task!.id, status: editor.status, note };
    else if (editor.mode === "create") body = { action: "upsertActionItem", description, ownerName: owner, dueAt: dueDate || null, status: "open" };
    else {
      const changes: ActionItemChanges = {};
      if (description !== editor.task!.title) changes.description = description;
      if (owner !== editor.task!.owner) changes.ownerName = owner;
      if (dueDate !== actionItemDateInput(editor.task!.dueAt, meeting.timeZone)) changes.dueAt = dueDate || null;
      body = { action: "editActionItem", actionItemId: editor.task!.id, changes };
    }
    try {
      const response = await fetchWithBoardStepUp("/api/meetings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, meetingId: meeting.id, expectedVersion: meeting.version }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setConflict(response.status === 409); throw new Error(result.error || "The task could not be saved."); }
      setMessage(editor.mode === "status" ? `Task marked ${labels[editor.status!].toLowerCase()}.` : "Task saved.");
      setEditor(null); refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "The task could not be saved."); }
    finally { setSaving(false); }
  }
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--muted)]">{items.filter((t) => t.status === "open").length} open · {items.filter((t) => t.status === "completed").length} completed · {items.filter((t) => t.status === "cancelled").length} cancelled</p>
      <div className="flex flex-wrap gap-2" aria-label="Task controls">
        {(["all", "open"] as const).map((value) => <button type="button" key={value} className={button} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All tasks" : "Open tasks"}</button>)}
        {canPrepare && <button type="button" className={button} disabled={busy || editor !== null} onClick={() => open({ mode: "create" })}>Add task</button>}
      </div>
    </div>
    {visible.length === 0 ? <p className="mt-4 text-sm text-[var(--muted)]">{items.length ? "No open tasks." : "No action items have been recorded."}</p> : <ul className="mt-4 grid gap-3">
      {visible.map((item) => <li key={item.id} className="min-w-0 rounded-2xl border border-[var(--border)] p-4">
        <h3 className="whitespace-pre-wrap break-words text-sm font-semibold">{item.title}</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">{labels[item.status]} · {item.owner}{item.dueAt ? ` · Due ${actionItemDateInput(item.dueAt, meeting.timeZone)}` : ""}</p>
        {canPrepare && <div className="mt-3 flex flex-wrap gap-2" aria-label={`Actions for ${item.title}`}>
          {item.status === "open" ? <>
            <button type="button" className={button} disabled={busy || editor !== null} onClick={() => open({ mode: "edit", task: item })}>Edit task</button>
            <button type="button" className={button} disabled={busy || editor !== null} onClick={() => open({ mode: "status", task: item, status: "completed" })}>Mark complete</button>
            <button type="button" className={button} disabled={busy || editor !== null} onClick={() => open({ mode: "status", task: item, status: "cancelled" })}>Cancel task</button>
          </> : <button type="button" className={button} disabled={busy || editor !== null} onClick={() => open({ mode: "status", task: item, status: "open" })}>Reopen task</button>}
        </div>}
      </li>)}
    </ul>}
    {canPrepare && editor && <form aria-label={editor.mode === "status" ? "Update task status" : editor.mode === "create" ? "Add task" : "Edit task"} onSubmit={save} className="mt-4 grid gap-3 rounded-2xl border border-[var(--border-strong)] p-4">
      <h3 className="font-semibold">{editor.mode === "status" ? `Mark task ${labels[editor.status!].toLowerCase()}` : editor.mode === "create" ? "Add task" : "Edit task"}</h3>
      {editor.mode === "status" ? <>
        <p className="whitespace-pre-wrap break-words text-sm">{editor.task!.title}</p>
        <label className="text-sm">Note (optional)<textarea autoFocus className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} /></label>
        <p className="text-xs text-[var(--muted)]">The change and any note remain in this meeting’s retained history. Keep confidential details in their restricted records.</p>
      </> : <>
        <label className="text-sm">Task description<textarea autoFocus required maxLength={4000} rows={3} className={field} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="text-sm">Owner<input required maxLength={200} className={field} value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
        <label className="text-sm">Due date<input type="date" className={field} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      </>}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || conflict} type="submit">{busy ? "Saving…" : editor.mode === "status" ? "Save status" : "Save task"}</button>
        <button className={button} disabled={busy} type="button" onClick={() => { setEditor(null); setError(""); setConflict(false); }}>Discard changes</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {conflict && <div><p className="text-sm">Refresh to review the latest tasks. Your entered changes will be kept.</p><button className={button} disabled={busy} type="button" onClick={() => { refresh(); setConflict(false); }}>Refresh tasks</button></div>}
    </form>}
    <p role="status" className="mt-3 text-sm">{message}</p>
  </div>;
}
