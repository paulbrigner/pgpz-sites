"use client";

import { useMemo, useState } from "react";
import {
  Archive, BookOpen, Building2, ChevronDown, ExternalLink, FileCheck2, FileText,
  Filter, Folder, Handshake, History, Package, Search, ShieldCheck, Tag,
} from "lucide-react";
import { formatBytes } from "@pgpz/document-vault";
import type { LibraryCategory, LibraryDocument } from "@/lib/document-library";

const categoryIcons = { incorporation: Building2, governance: ShieldCheck, policies: FileText, agreements: Handshake, "brand-trademark": Tag } as const;
const roleIcons = { package: Package, guidelines: BookOpen, governance: ShieldCheck, manifest: Archive, checksum: FileCheck2, document: FileText } as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function includesQuery(document: LibraryDocument, query: string) {
  return [document.title, document.description, document.categoryLabel, document.collectionLabel ?? "", document.role, document.typeLabel]
    .join(" ").toLowerCase().includes(query);
}

function DocumentRow({
  document,
  nested = false,
  focused = false,
  showHistory = false,
}: {
  document: LibraryDocument;
  nested?: boolean;
  focused?: boolean;
  showHistory?: boolean;
}) {
  const Icon = roleIcons[document.role];
  const [historyOpen, setHistoryOpen] = useState(focused && showHistory);
  const historyId = `document-history-${document.documentId}`;
  return (
    <li
      id={`document-${document.documentId}`}
      className={`scroll-mt-24 border-t border-[var(--border)] first:border-t-0 ${focused ? "bg-[var(--accent-soft)]/35 ring-2 ring-inset ring-[var(--accent-border)]" : "bg-white/82"}`}
    >
      <div className={`relative grid gap-2 px-4 py-2 sm:px-6 lg:grid-cols-[minmax(24rem,1fr)_9rem_6rem_6rem_7rem_5rem_2rem] lg:items-center lg:gap-4 ${nested ? "lg:pl-10" : ""}`}>
        <div className="flex min-w-0 items-start gap-3 pr-10 lg:pr-0">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
          <div className="min-w-0">
            <a href={document.downloadHref} className="font-semibold text-[var(--foreground)] underline decoration-[var(--border-strong)] underline-offset-4 transition hover:decoration-[var(--foreground)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">{document.title}</a>
            {document.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)] lg:hidden">{document.description}</p> : null}
          </div>
        </div>
        <span className="hidden truncate text-sm text-[var(--muted)] lg:block">{document.collectionLabel ?? "—"}</span>
        <span className="text-xs text-[var(--muted)] before:font-semibold before:text-[var(--foreground)] before:content-['Type:_'] lg:text-sm lg:before:content-none">{document.typeLabel}</span>
        <button
          type="button"
          aria-expanded={historyOpen}
          aria-controls={historyId}
          onClick={() => setHistoryOpen((current) => !current)}
          className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--primary)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] lg:text-sm"
        >
          {document.versionLabel} <span className="font-normal text-[var(--muted)]">({document.versionCount})</span>
          <History className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span className="text-xs text-[var(--muted)] before:font-semibold before:text-[var(--foreground)] before:content-['Updated:_'] lg:text-sm lg:before:content-none">{formatDate(document.updatedAt)}</span>
        <span className="text-xs text-[var(--muted)] before:font-semibold before:text-[var(--foreground)] before:content-['Size:_'] lg:text-sm lg:before:content-none">{formatBytes(document.byteLength)}</span>
        <a href={document.downloadHref} aria-label={`Open ${document.title}`} title={`Open ${document.title}`} className="absolute right-4 top-3 rounded-lg p-2 text-[var(--primary)] transition hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:right-6 lg:static lg:justify-self-end"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
      </div>
      {historyOpen ? (
        <div id={historyId} className="border-t border-[var(--border)] bg-[var(--primary-soft)]/45 px-5 py-3 sm:px-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Version history</p>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {document.versions.map((version, index) => (
              <li key={version.versionId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs text-[var(--muted)]">
                <span className="font-semibold text-[var(--foreground)]">Version {version.sequence}{index === 0 ? " · Current" : ""}</span>
                <span>{formatDate(version.uploadedAt)}</span>
                <span>{formatBytes(version.byteLength)}</span>
                <a href={version.downloadHref} className="font-semibold text-[var(--primary)] underline underline-offset-4">Open this version</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function CategoryDocuments({
  documents,
  focusDocumentId,
  showFocusedHistory,
  searchActive,
}: {
  documents: ReadonlyArray<LibraryDocument>;
  focusDocumentId?: string;
  showFocusedHistory: boolean;
  searchActive: boolean;
}) {
  const collectionIds = ([...new Set(documents.map((document) => document.collectionId).filter(Boolean))] as string[]).sort();
  const focusedCollection = documents.find((document) => document.documentId === focusDocumentId)?.collectionId;
  const [openCollections, setOpenCollections] = useState<Set<string>>(() => new Set(focusedCollection ? [focusedCollection] : []));
  const bundledIds = new Set(documents.filter((document) => document.collectionId).map((document) => document.documentId));
  const standalone = documents.filter((document) => !bundledIds.has(document.documentId));
  const roleOrder = { package: 0, guidelines: 1, governance: 2, manifest: 3, checksum: 4, document: 5 };

  function toggleCollection(collectionId: string) {
    setOpenCollections((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  }

  return (
    <div className="border-t border-[var(--border)] bg-[var(--primary-soft)]/20 pb-3">
      <div className="hidden grid-cols-[minmax(24rem,1fr)_9rem_6rem_6rem_7rem_5rem_2rem] gap-4 px-9 py-3 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)] lg:grid">
        <span>Name</span><span>Collection</span><span>Type</span><span>Versions</span><span>Updated</span><span>Size</span><span className="sr-only">Open</span>
      </div>
      <ul className="space-y-2 px-3">
        {collectionIds.map((collectionId) => {
          const bundled = documents.filter((document) => document.collectionId === collectionId).sort((left, right) => roleOrder[left.role] - roleOrder[right.role]);
          const isOpen = searchActive || openCollections.has(collectionId);
          const panelId = `document-collection-${collectionId}`;
          return (
            <li key={collectionId} className="overflow-hidden rounded-xl border border-[var(--border)] bg-white/75">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleCollection(collectionId)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] sm:px-5"
              >
                <Package className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
                <span className="flex-1"><span className="block font-semibold text-[var(--foreground)]">{bundled[0]?.collectionLabel}</span><span className="block text-xs text-[var(--muted)]">{bundled.length} related files</span></span>
                <ChevronDown className={`h-4 w-4 text-[var(--primary)] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {isOpen ? (
                <ul id={panelId} className="ml-4 border-l-2 border-[var(--accent-border)] sm:ml-7">
                  {bundled.map((document) => <DocumentRow key={document.documentId} document={document} nested focused={document.documentId === focusDocumentId} showHistory={showFocusedHistory} />)}
                </ul>
              ) : null}
            </li>
          );
        })}
        {standalone.length > 0 ? (
          <li className="overflow-hidden rounded-xl border border-[var(--border)]">
            <ul>{standalone.map((document) => <DocumentRow key={document.documentId} document={document} focused={document.documentId === focusDocumentId} showHistory={showFocusedHistory} />)}</ul>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function DocumentLibrary({
  categories,
  focusDocumentId,
  showFocusedHistory = false,
}: {
  categories: ReadonlyArray<LibraryCategory>;
  focusDocumentId?: string;
  showFocusedHistory?: boolean;
}) {
  const focusedCategory = categories.find((category) => category.documents.some((document) => document.documentId === focusDocumentId));
  const defaultOpen = focusedCategory?.key ?? categories.find((category) => category.key === "brand-trademark")?.key ?? categories[0]?.key ?? "";
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set(defaultOpen ? [defaultOpen] : []));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCategories = useMemo(() => categories
    .filter((category) => categoryFilter === "all" || category.key === categoryFilter)
    .map((category) => ({ ...category, documents: normalizedQuery ? category.documents.filter((document) => includesQuery(document, normalizedQuery)) : category.documents }))
    .filter((category) => category.documents.length > 0), [categories, categoryFilter, normalizedQuery]);

  function toggleCategory(key: string) {
    setOpenCategories((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  return (
    <div className="mt-3 max-w-[84rem]">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
        <label className="relative block"><span className="sr-only">Search documents</span><Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents by name, keyword, or description" className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-white/90 pl-11 pr-4 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]" /></label>
        <label className="relative block"><span className="sr-only">Filter by category</span><Filter className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[var(--border-strong)] bg-white/90 pl-11 pr-10 text-sm font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus)]"><option value="all">All categories</option>{categories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /></label>
      </div>
      {visibleCategories.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white/82 p-8 text-center"><Search className="mx-auto h-6 w-6 text-[var(--muted)]" aria-hidden="true" /><p className="mt-3 font-semibold text-[var(--foreground)]">No documents match your search.</p><button type="button" onClick={() => { setQuery(""); setCategoryFilter("all"); }} className="mt-2 text-sm font-semibold text-[var(--primary)] underline underline-offset-4">Clear filters</button></div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-white/82 shadow-[0_26px_70px_-52px_rgba(15,23,42,0.5)]">
          {visibleCategories.map((category) => {
            const Icon = categoryIcons[category.key as keyof typeof categoryIcons] ?? Folder;
            const isOpen = normalizedQuery.length > 0 || openCategories.has(category.key);
            const panelId = `library-category-${category.key}`;
            return (
              <section key={category.key} className="border-t border-[var(--border)] first:border-t-0">
                <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggleCategory(category.key)} className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] sm:px-6">
                  <Icon className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-[var(--foreground)]">{category.label}</span><span className="block text-xs leading-5 text-[var(--muted)] sm:text-sm">{category.description}</span></span>
                  <span className="shrink-0 text-xs text-[var(--muted)] sm:text-sm">{category.documents.length} {category.documents.length === 1 ? "document" : "documents"}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--primary)] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {isOpen ? <div id={panelId}><CategoryDocuments documents={category.documents} focusDocumentId={focusDocumentId} showFocusedHistory={showFocusedHistory} searchActive={normalizedQuery.length > 0} /></div> : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
