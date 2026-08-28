"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive, ArchiveRestore, BookOpen, Building2, ChevronDown, ExternalLink,
  FileCheck2, FileText, Filter, Folder, Handshake, History, MoreHorizontal,
  Package, Plus, Search, ShieldCheck, Tag, Upload,
} from "lucide-react";
import { formatBytes } from "@pgpz/document-vault";
import { buttonStyles } from "@pgpz/ui";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import { DOCUMENT_CATEGORY_OPTIONS, type LibraryCategory, type LibraryDocument } from "@/lib/document-library";

const ACCEPTED_DOCUMENTS = ".pdf,.zip,.json,.txt,.md,.csv";
const categoryIcons = { incorporation: Building2, governance: ShieldCheck, policies: FileText, agreements: Handshake, "brand-trademark": Tag } as const;
const roleIcons = { package: Package, guidelines: BookOpen, governance: ShieldCheck, manifest: Archive, checksum: FileCheck2, document: FileText } as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function includesQuery(document: LibraryDocument, query: string) {
  return [document.title, document.description, document.categoryLabel, document.collectionLabel ?? "", document.role, document.typeLabel]
    .join(" ").toLowerCase().includes(query);
}

async function documentMutation(body: unknown) {
  const response = await fetchWithBoardStepUp("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new Error(typeof payload?.error === "string" ? payload.error : "The document action could not be completed.");
  }
  return response.json();
}

function NewDocumentPanel({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (input: { title: string; description: string; category: string; file: File }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORY_OPTIONS[0].key);
  const [file, setFile] = useState<File | null>(null);

  return (
    <section className="mt-4 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)]/35 p-5" aria-labelledby="new-document-heading">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--primary)]"><Upload className="h-4 w-4" aria-hidden="true" /></span>
        <div>
          <h2 id="new-document-heading" className="font-semibold text-[var(--foreground)]">Add a governed document</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">The uploaded file becomes Version 1 and is retained in the governance vault.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--foreground)]">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm font-normal outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--foreground)]">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm font-normal outline-none focus:ring-2 focus:ring-[var(--focus)]">{DOCUMENT_CATEGORY_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--foreground)] md:col-span-2">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short description shown in the library" className="h-11 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-sm font-normal outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--foreground)] md:col-span-2">File<input type="file" accept={ACCEPTED_DOCUMENTS} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="rounded-xl border border-dashed border-[var(--border-strong)] bg-white px-4 py-3 text-sm font-normal text-[var(--muted)]" /></label>
      </div>
      <button
        type="button"
        disabled={busy || !title.trim() || !file}
        onClick={async () => {
          if (!file) return;
          if (await onCreate({ title: title.trim(), description: description.trim(), category, file })) {
            setTitle(""); setDescription(""); setFile(null);
          }
        }}
        className={buttonStyles({ className: "mt-4" })}
      ><Plus className="h-4 w-4" aria-hidden="true" />{busy ? "Adding…" : "Add document"}</button>
    </section>
  );
}

type ManagementActions = {
  busyDocumentId: string | null;
  onAddVersion: (document: LibraryDocument, file: File) => Promise<void>;
  onRename: (document: LibraryDocument, title: string) => Promise<boolean>;
  onToggleArchive: (document: LibraryDocument) => Promise<void>;
};

function DocumentRow({
  document, nested = false, focused = false, showHistory = false, management,
}: {
  document: LibraryDocument;
  nested?: boolean;
  focused?: boolean;
  showHistory?: boolean;
  management?: ManagementActions;
}) {
  const Icon = roleIcons[document.role];
  const [historyOpen, setHistoryOpen] = useState(focused && showHistory);
  const [manageOpen, setManageOpen] = useState(false);
  const [displayName, setDisplayName] = useState(document.title);
  const historyId = `document-history-${document.documentId}`;
  const managementId = `document-management-${document.documentId}`;
  const busy = management?.busyDocumentId === document.documentId;
  return (
    <li id={`document-${document.documentId}`} className={`scroll-mt-24 border-t border-[var(--border)] first:border-t-0 ${focused ? "bg-[var(--accent-soft)]/35 ring-2 ring-inset ring-[var(--accent-border)]" : "bg-white/82"}`}>
      <div className={`relative grid gap-2 px-4 py-2 sm:px-6 lg:grid-cols-[minmax(22rem,1fr)_9rem_6rem_6rem_7rem_5rem_4.5rem] lg:items-center lg:gap-4 ${nested ? "lg:pl-10" : ""}`}>
        <div className="flex min-w-0 items-start gap-3 pr-20 lg:pr-0">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><a href={document.downloadHref} className="font-semibold text-[var(--foreground)] underline decoration-[var(--border-strong)] underline-offset-4 transition hover:decoration-[var(--foreground)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">{document.title}</a>{document.status === "archived" ? <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--muted)]">Archived</span> : null}</div>
            {document.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)] lg:hidden">{document.description}</p> : null}
          </div>
        </div>
        <span className="hidden truncate text-sm text-[var(--muted)] lg:block">{document.collectionLabel ?? "—"}</span>
        <span className="text-xs text-[var(--muted)] before:font-semibold before:text-[var(--foreground)] before:content-['Type:_'] lg:text-sm lg:before:content-none">{document.typeLabel}</span>
        <button type="button" aria-expanded={historyOpen} aria-controls={historyId} onClick={() => setHistoryOpen((current) => !current)} className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--primary)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] lg:text-sm">{document.versionLabel} <span className="font-normal text-[var(--muted)]">({document.versionCount})</span><History className="h-3.5 w-3.5" aria-hidden="true" /></button>
        <span className="text-xs text-[var(--muted)] before:font-semibold before:text-[var(--foreground)] before:content-['Updated:_'] lg:text-sm lg:before:content-none">{formatDate(document.updatedAt)}</span>
        <span className="text-xs text-[var(--muted)] before:font-semibold before:text-[var(--foreground)] before:content-['Size:_'] lg:text-sm lg:before:content-none">{formatBytes(document.byteLength)}</span>
        <div className="absolute right-3 top-1.5 flex items-center lg:static lg:justify-self-end">
          <a href={document.downloadHref} aria-label={`Open ${document.title}`} title={`Open ${document.title}`} className="rounded-lg p-2 text-[var(--primary)] transition hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
          {management ? <button type="button" aria-label={`Manage ${document.title}`} aria-expanded={manageOpen} aria-controls={managementId} onClick={() => setManageOpen((current) => !current)} className="rounded-lg p-2 text-[var(--primary)] transition hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></button> : null}
        </div>
      </div>
      {historyOpen ? (
        <div id={historyId} className="border-t border-[var(--border)] bg-[var(--primary-soft)]/45 px-5 py-3 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Version history</p><p className="mt-1 text-xs text-[var(--muted)]">Adding a version preserves the earlier files in this record.</p></div>
            {management ? <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] ${busy ? "pointer-events-none opacity-50" : ""}`}><Upload className="h-3.5 w-3.5" aria-hidden="true" />{busy ? "Uploading…" : "Add version"}<input type="file" accept={ACCEPTED_DOCUMENTS} disabled={busy} className="sr-only" aria-label={`Add version to ${document.title}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) void management.onAddVersion(document, file); event.currentTarget.value = ""; }} /></label> : null}
          </div>
          <ul className="mt-2 divide-y divide-[var(--border)]">{document.versions.map((version, index) => <li key={version.versionId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs text-[var(--muted)]"><span className="font-semibold text-[var(--foreground)]">Version {version.sequence}{index === 0 ? " · Current" : ""}</span><span>{formatDate(version.uploadedAt)}</span><span>{formatBytes(version.byteLength)}</span><a href={version.downloadHref} className="font-semibold text-[var(--primary)] underline underline-offset-4">Open this version</a></li>)}</ul>
        </div>
      ) : null}
      {management && manageOpen ? (
        <div id={managementId} className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4 sm:px-10">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-[16rem] flex-1 gap-1.5 text-xs font-semibold text-[var(--foreground)]">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-10 rounded-xl border border-[var(--border-strong)] bg-white px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
            <button type="button" disabled={busy || !displayName.trim() || displayName.trim() === document.title} onClick={async () => { const title = displayName.trim(); if (await management.onRename(document, title)) setDisplayName(title); }} className={buttonStyles({ variant: "outline", size: "sm" })}>Save display name</button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs text-[var(--muted)]">{document.status === "archived" ? "Return this record to the active library." : "Hide this record from directors while preserving every retained version."}</p>
            <button type="button" disabled={busy} onClick={() => void management.onToggleArchive(document)} className={buttonStyles({ variant: "outline", size: "sm" })}>{document.status === "archived" ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}{busy ? "Working…" : document.status === "archived" ? "Restore to active library" : "Archive document"}</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function CategoryDocuments({ documents, focusDocumentId, showFocusedHistory, searchActive, management }: { documents: ReadonlyArray<LibraryDocument>; focusDocumentId?: string; showFocusedHistory: boolean; searchActive: boolean; management?: ManagementActions }) {
  const collectionIds = ([...new Set(documents.map((document) => document.collectionId).filter(Boolean))] as string[]).sort();
  const focusedCollection = documents.find((document) => document.documentId === focusDocumentId)?.collectionId;
  const [openCollections, setOpenCollections] = useState<Set<string>>(() => new Set(focusedCollection ? [focusedCollection] : []));
  const bundledIds = new Set(documents.filter((document) => document.collectionId).map((document) => document.documentId));
  const standalone = documents.filter((document) => !bundledIds.has(document.documentId));
  const roleOrder = { package: 0, guidelines: 1, governance: 2, manifest: 3, checksum: 4, document: 5 };
  function toggleCollection(collectionId: string) { setOpenCollections((current) => { const next = new Set(current); if (next.has(collectionId)) next.delete(collectionId); else next.add(collectionId); return next; }); }
  return (
    <div className="border-t border-[var(--border)] bg-[var(--primary-soft)]/20 pb-3">
      <div className="hidden grid-cols-[minmax(22rem,1fr)_9rem_6rem_6rem_7rem_5rem_4.5rem] gap-4 px-9 py-3 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)] lg:grid"><span>Name</span><span>Collection</span><span>Type</span><span>Versions</span><span>Updated</span><span>Size</span><span className="sr-only">Actions</span></div>
      <ul className="space-y-2 px-3">
        {collectionIds.map((collectionId) => { const bundled = documents.filter((document) => document.collectionId === collectionId).sort((left, right) => roleOrder[left.role] - roleOrder[right.role]); const isOpen = searchActive || openCollections.has(collectionId); const panelId = `document-collection-${collectionId}`; return <li key={collectionId} className="overflow-hidden rounded-xl border border-[var(--border)] bg-white/75"><button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggleCollection(collectionId)} className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] sm:px-5"><Package className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" /><span className="flex-1"><span className="block font-semibold text-[var(--foreground)]">{bundled[0]?.collectionLabel}</span><span className="block text-xs text-[var(--muted)]">{bundled.length} related files</span></span><ChevronDown className={`h-4 w-4 text-[var(--primary)] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button>{isOpen ? <ul id={panelId} className="ml-4 border-l-2 border-[var(--accent-border)] sm:ml-7">{bundled.map((document) => <DocumentRow key={document.documentId} document={document} nested focused={document.documentId === focusDocumentId} showHistory={showFocusedHistory} management={management} />)}</ul> : null}</li>; })}
        {standalone.length > 0 ? <li className="overflow-hidden rounded-xl border border-[var(--border)]"><ul>{standalone.map((document) => <DocumentRow key={document.documentId} document={document} focused={document.documentId === focusDocumentId} showHistory={showFocusedHistory} management={management} />)}</ul></li> : null}
      </ul>
    </div>
  );
}

export function DocumentLibrary({ categories, focusDocumentId, showFocusedHistory = false, canManage = false }: { categories: ReadonlyArray<LibraryCategory>; focusDocumentId?: string; showFocusedHistory?: boolean; canManage?: boolean }) {
  const router = useRouter();
  const focusedDocument = categories.flatMap((category) => category.documents).find((document) => document.documentId === focusDocumentId);
  const focusedCategory = categories.find((category) => category.documents.some((document) => document.documentId === focusDocumentId));
  const defaultOpen = focusedCategory?.key ?? categories.find((category) => category.key === "brand-trademark")?.key ?? categories[0]?.key ?? "";
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">(focusedDocument?.status ?? "active");
  const [showNewDocument, setShowNewDocument] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set(defaultOpen ? [defaultOpen] : []));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCategories = useMemo(() => categories.filter((category) => categoryFilter === "all" || category.key === categoryFilter).map((category) => ({ ...category, documents: category.documents.filter((document) => (!canManage || document.status === statusFilter) && (!normalizedQuery || includesQuery(document, normalizedQuery))) })).filter((category) => category.documents.length > 0), [canManage, categories, categoryFilter, normalizedQuery, statusFilter]);

  async function uploadToStaging(file: File) {
    const prepared = await documentMutation({ action: "prepareUpload" }) as { stagingKey: string; uploadUrl: string };
    const upload = await fetch(prepared.uploadUrl, { method: "PUT", body: file });
    if (!upload.ok) throw new Error("The file could not be uploaded to the governance vault.");
    return prepared.stagingKey;
  }

  async function createDocument(input: { title: string; description: string; category: string; file: File }) {
    setBusyDocumentId("new"); setMessage(null);
    try {
      const stagingKey = await uploadToStaging(input.file);
      await documentMutation({ action: "create", stagingKey, fileName: input.file.name, title: input.title, description: input.description, category: input.category });
      setMessage(`${input.title} was added to the library.`); setShowNewDocument(false); setStatusFilter("active"); router.refresh(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "The document could not be added."); return false; }
    finally { setBusyDocumentId(null); }
  }

  async function addVersion(document: LibraryDocument, file: File) {
    setBusyDocumentId(document.documentId); setMessage(null);
    try { const stagingKey = await uploadToStaging(file); await documentMutation({ action: "addVersion", documentId: document.documentId, stagingKey, fileName: file.name }); setMessage(`A new version of ${document.title} was added.`); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The version could not be added."); }
    finally { setBusyDocumentId(null); }
  }

  async function toggleArchive(document: LibraryDocument) {
    setBusyDocumentId(document.documentId); setMessage(null);
    try { await documentMutation({ action: document.status === "archived" ? "unarchive" : "archive", documentId: document.documentId }); setMessage(document.status === "archived" ? `${document.title} was restored.` : `${document.title} was archived.`); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The document status could not be changed."); }
    finally { setBusyDocumentId(null); }
  }

  async function renameDocument(document: LibraryDocument, title: string) {
    setBusyDocumentId(document.documentId); setMessage(null);
    try {
      await documentMutation({ action: "updateDisplayName", documentId: document.documentId, displayName: title });
      setMessage(`The display name was changed to ${title}.`); router.refresh(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "The display name could not be changed."); return false; }
    finally { setBusyDocumentId(null); }
  }

  function toggleCategory(key: string) { setOpenCategories((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  const management = canManage ? { busyDocumentId, onAddVersion: addVersion, onRename: renameDocument, onToggleArchive: toggleArchive } : undefined;

  return (
    <div className="mt-3 max-w-[84rem]">
      {canManage ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white/72 px-4 py-3 sm:px-5"><div><p className="text-sm font-semibold text-[var(--foreground)]">Document management</p><p className="text-xs text-[var(--muted)]">Your role can add documents, publish versions, and manage archived records.</p></div><button type="button" aria-expanded={showNewDocument} onClick={() => setShowNewDocument((current) => !current)} className={buttonStyles({ size: "sm" })}><Plus className="h-4 w-4" aria-hidden="true" />Add document</button></div> : null}
      {canManage && showNewDocument ? <NewDocumentPanel busy={busyDocumentId === "new"} onCreate={createDocument} /> : null}
      {message ? <p role="status" className="mt-3 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
      <div className={`mt-3 grid gap-3 ${canManage ? "md:grid-cols-[minmax(0,1fr)_13rem_11rem]" : "md:grid-cols-[minmax(0,1fr)_15rem]"}`}>
        <label className="relative block"><span className="sr-only">Search documents</span><Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents by name, keyword, or description" className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-white/90 pl-11 pr-4 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]" /></label>
        <label className="relative block"><span className="sr-only">Filter by category</span><Filter className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[var(--border-strong)] bg-white/90 pl-11 pr-10 text-sm font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]"><option value="all">All categories</option>{categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /></label>
        {canManage ? <label className="relative block"><span className="sr-only">Filter by document status</span><Archive className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "active" | "archived")} className="h-11 w-full appearance-none rounded-xl border border-[var(--border-strong)] bg-white/90 pl-11 pr-10 text-sm font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]"><option value="active">Active documents</option><option value="archived">Archived documents</option></select><ChevronDown className="pointer-events-none absolute right-4 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /></label> : null}
      </div>
      {visibleCategories.length === 0 ? <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white/82 p-8 text-center"><Search className="mx-auto h-6 w-6 text-[var(--muted)]" aria-hidden="true" /><p className="mt-3 font-semibold text-[var(--foreground)]">{canManage && statusFilter === "archived" ? "No archived documents." : "No documents match these filters."}</p><button type="button" onClick={() => { setQuery(""); setCategoryFilter("all"); setStatusFilter("active"); }} className="mt-2 text-sm font-semibold text-[var(--primary)] underline underline-offset-4">Clear filters</button></div> : <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-white/82 shadow-[0_26px_70px_-52px_rgba(15,23,42,0.5)]">{visibleCategories.map((category) => { const Icon = categoryIcons[category.key as keyof typeof categoryIcons] ?? Folder; const isOpen = normalizedQuery.length > 0 || openCategories.has(category.key); const panelId = `library-category-${category.key}`; return <section key={category.key} className="border-t border-[var(--border)] first:border-t-0"><button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggleCategory(category.key)} className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] sm:px-6"><Icon className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block font-semibold text-[var(--foreground)]">{category.label}</span><span className="block text-xs leading-5 text-[var(--muted)] sm:text-sm">{category.description}</span></span><span className="shrink-0 text-xs text-[var(--muted)] sm:text-sm">{category.documents.length} {category.documents.length === 1 ? "document" : "documents"}</span><ChevronDown className={`h-4 w-4 shrink-0 text-[var(--primary)] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button>{isOpen ? <div id={panelId}><CategoryDocuments documents={category.documents} focusDocumentId={focusDocumentId} showFocusedHistory={showFocusedHistory} searchActive={normalizedQuery.length > 0} management={management} /></div> : null}</section>; })}</div>}
    </div>
  );
}
