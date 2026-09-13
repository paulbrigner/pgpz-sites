"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Library, Plus, X } from "lucide-react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { ConsentAttachment } from "@/lib/written-consents";
import type { MeetingSummaryView } from "./types";

const field = "mt-1.5 block min-w-0 w-full max-w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm";

function useMaterialAction(meeting: MeetingSummaryView) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function save(body: Record<string, unknown>, success: string) {
    setPending(true); setNotice(null);
    try {
      const response = await fetchWithBoardStepUp(`/api/meetings/${encodeURIComponent(meeting.id)}/materials`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, expectedVersion: meeting.version }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The preparation reference could not be saved.");
      setNotice(success); router.refresh(); return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The preparation reference could not be saved."); return false;
    } finally { setPending(false); }
  }
  return { pending, notice, save };
}

export function MeetingLibraryMaterials({ meeting, choices }: { meeting: MeetingSummaryView; choices: readonly ConsentAttachment[] }) {
  const { pending, notice, save } = useMaterialAction(meeting);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const filtered = choices.filter((doc) => `${doc.title} ${doc.fileName}`.toLowerCase().includes(search.toLowerCase()));
  const key = (doc: ConsentAttachment) => JSON.stringify([doc.documentId, doc.versionId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const document = choices.find((doc) => key(doc) === selected);
    if (document && await save({ action: "add", documentId: document.documentId, versionId: document.versionId }, "Library reference added to Preparation materials.")) {
      setSearch(""); setSelected("");
    }
  }
  return <details className="mt-4 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
    <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><Library className="mr-2 inline h-4 w-4" aria-hidden="true" />Add from Document Library</summary>
    <form onSubmit={submit} className="min-w-0 border-t border-[var(--border)] p-4">
      <p className="text-xs leading-5 text-[var(--muted)]">Link an existing file without uploading another copy. The selected version stays fixed in this meeting’s materials. This does not adopt the document or change a resolution’s attachments.</p>
      {choices.length ? <>
        <label className="mt-3 block text-sm font-semibold">Find a library document<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setSelected(""); }} className={field} /></label>
        <label className="mt-3 block min-w-0 text-sm font-semibold">Document and version<select required value={selected} onChange={(event) => setSelected(event.target.value)} className={field}>
          <option value="">Select a version</option>
          {filtered.map((doc) => <option key={key(doc)} value={key(doc)}>{doc.title} · v{doc.sequence} · {doc.fileName}</option>)}
        </select></label>
        {!filtered.length && <p className="mt-2 text-sm">No matching library documents.</p>}
        <button type="submit" disabled={pending || !selected} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden="true" />{pending ? "Adding…" : "Add reference"}</button>
      </> : <p className="mt-3 text-sm">All available library versions are already included, or no active library documents are available.</p>}
      {notice && <p role="status" className="mt-3 text-sm [overflow-wrap:anywhere]">{notice}</p>}
    </form>
  </details>;
}

export function RemoveMeetingLibraryReference({ meeting, referenceId, title }: { meeting: MeetingSummaryView; referenceId: string; title: string }) {
  const { pending, notice, save } = useMaterialAction(meeting);
  return <div className="min-w-0">
    <button type="button" disabled={pending} aria-label={`Remove reference to ${title}`} title="Remove from meeting materials; keep the library document" onClick={() => void save({ action: "remove", referenceId }, "Reference removed; the library document and retained history are unchanged.")} className="rounded-full border border-[var(--border)] p-2 text-[var(--muted)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><X className="h-4 w-4" aria-hidden="true" /></button>
    {notice && <p role="status" className="mt-2 max-w-48 text-xs [overflow-wrap:anywhere]">{notice}</p>}
  </div>;
}
