"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import type { AsyncBallotView, MeetingDetailView } from "./types";

const field = "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3 py-2.5 text-sm font-normal";
const secondary = "rounded-full border border-[var(--border-strong)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
type DocumentChoice = NonNullable<MeetingDetailView["consentDocumentChoices"]>[number];
type Selection = { document: DocumentChoice; treatment: "support" | "adopt" };

export function ResolutionDraftForm({ ballot, documentChoices, pending, onSave }: {
  ballot?: AsyncBallotView;
  documentChoices: NonNullable<MeetingDetailView["consentDocumentChoices"]>;
  pending: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Selection[]>(() => (ballot?.attachments || []).map((document) => ({
    document,
    treatment: ballot?.adoption?.targets.some((target) => target.documentId === document.documentId && target.versionId === document.versionId) ? "adopt" : "support",
  })));
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const pickerId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding) searchInput.current?.focus(); }, [adding]);
  const available = documentChoices.filter((doc) => !selected.some((item) => item.document.documentId === doc.documentId));
  const query = search.trim().toLocaleLowerCase();
  const matches = available.filter((doc) => `${doc.title} ${doc.fileName}`.toLocaleLowerCase().includes(query));

  function closePicker() {
    setAdding(false); setSearch(""); addButton.current?.focus();
  }

  return <form onSubmit={async (event) => {
    const form = event.currentTarget;
    if (await onSave(event) && !ballot) {
      form.reset(); setSelected([]); setAdding(false); setSearch(""); setAnnouncement("");
    }
  }} className="mt-3 grid gap-4">
    <label className="text-sm font-semibold">Resolution title<input name="title" required maxLength={200} defaultValue={ballot?.title} className={field} /></label>
    <label className="text-sm font-semibold">Exact resolution text<textarea name="motion" required maxLength={16000} rows={6} defaultValue={ballot?.motion} className={field} /></label>
    <fieldset className="min-w-0 rounded-xl border border-[var(--border)] bg-white p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold">Included documents ({selected.length})</legend>
      <p className="text-xs leading-5 text-[var(--muted)]">Supporting documents provide context. Choose “Adopt this document” only when the resolution expressly adopts that version.</p>
      {selected.length ? <ul className="mt-3 grid gap-3">{selected.map(({ document: doc, treatment }) => {
        const newer = documentChoices.find((choice) => choice.documentId === doc.documentId && choice.versionId !== doc.versionId);
        return <li key={`${doc.documentId}:${doc.versionId}`} className="min-w-0 rounded-xl border border-[var(--border)] p-3">
          <input type="hidden" name="document" value={JSON.stringify({ documentId: doc.documentId, versionId: doc.versionId, treatment })} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-center">
            <span className="min-w-0 break-words text-sm font-medium">{doc.title}<span className="ml-2 whitespace-nowrap text-xs font-normal text-[var(--muted)]">v{doc.sequence}</span></span>
            <select aria-label={`Treatment of ${doc.title} · v${doc.sequence}`} value={treatment} onChange={(event) => {
              const next = event.target.value as Selection["treatment"];
              setSelected((items) => items.map((item) => item.document.documentId === doc.documentId ? { ...item, treatment: next } : item));
            }} className={field} disabled={pending}>
              <option value="support">Supporting document</option><option value="adopt">Adopt this document</option>
            </select>
            <button type="button" disabled={pending} aria-label={`Remove ${doc.title} · v${doc.sequence}`} className="w-fit rounded-lg px-2 py-2 text-sm font-semibold underline" onClick={() => {
              setSelected((items) => items.filter((item) => item.document.documentId !== doc.documentId));
              setAnnouncement(`${doc.title} removed from this draft.`); addButton.current?.focus();
            }}>Remove</button>
          </div>
          {newer && <p className="mt-2 text-xs leading-5 text-amber-900">A newer version (v{newer.sequence}) is available. Review it, then remove this version and add the current version before saving. Your selection has not been replaced.</p>}
        </li>;
      })}</ul> : <p className="mt-3 text-sm text-[var(--muted)]">No documents included yet.</p>}
      <button ref={addButton} type="button" aria-expanded={adding} aria-controls={pickerId} disabled={pending} className={`${secondary} mt-3`} onClick={() => { if (adding) closePicker(); else setAdding(true); }}>Add documents</button>
      {adding && <div id={pickerId} className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closePicker(); } }}>
        <label className="text-sm font-semibold">Search documents<input ref={searchInput} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title or filename" className={field} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} /></label>
        <p role="status" className="mt-2 text-xs text-[var(--muted)]">{matches.length} available {matches.length === 1 ? "document" : "documents"}</p>
        <ul className="mt-2 max-h-64 overflow-y-auto overscroll-contain">{matches.map((doc) => <li key={`${doc.documentId}:${doc.versionId}`} className="flex items-center justify-between gap-3 border-t border-[var(--border)] py-3 text-sm">
          <span className="min-w-0 break-words">{doc.title}<span className="ml-2 whitespace-nowrap text-xs text-[var(--muted)]">v{doc.sequence}</span></span>
          <button type="button" disabled={pending || selected.length >= 20} className={`${secondary} shrink-0`} aria-label={`Add ${doc.title} · v${doc.sequence}`} onClick={() => {
            setSelected((items) => [...items, { document: doc, treatment: "support" }]);
            setAnnouncement(`${doc.title} added as a supporting document.`); searchInput.current?.focus();
          }}>Add</button>
        </li>)}</ul>
        {!matches.length && <p className="py-3 text-sm text-[var(--muted)]">{available.length ? "No matching documents. Try another search." : "All available documents are included."}</p>}
        {selected.length >= 20 && <p className="mt-2 text-sm text-amber-900">A resolution can include up to 20 documents. Remove one to add another.</p>}
        <button type="button" className={`${secondary} mt-2`} onClick={closePicker}>Done adding documents</button>
      </div>}
      {!documentChoices.length && !selected.length && <p className="mt-2 text-xs text-[var(--muted)]">Add documents to the Document Library, then refresh to select their exact versions.</p>}
      <p role="status" className="sr-only">{announcement}</p>
    </fieldset>
    <label className="text-sm font-semibold">Effective date / conditions (optional)<textarea name="effectiveTerms" maxLength={2000} rows={2} defaultValue={ballot?.adoption?.effectiveTerms} className={field} /><span className="mt-1 block text-xs font-normal text-[var(--muted)]">Match the resolution text. This is signed with the resolution; the app does not determine whether a condition has been satisfied.</span></label>
    <p className="text-xs leading-5 text-[var(--muted)]">Use one resolution per decision. All directors must sign each item. The resolution text, document versions, adoption targets, and effective terms become fixed when collection opens.</p>
    <button disabled={pending} className="w-fit rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save draft resolution</button>
  </form>;
}
