import type { DocumentItem, DocumentVersion } from "@pgpz/document-vault";
import { BRAND_DOCUMENT_CATEGORY, BRAND_LIBRARY_ENTRIES } from "@/lib/brand-library";

export type LibraryDocumentRole = "package" | "guidelines" | "governance" | "manifest" | "checksum" | "document";

export type LibraryDocument = Readonly<{
  documentId: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  collectionId: string | null;
  collectionLabel: string | null;
  role: LibraryDocumentRole;
  typeLabel: string;
  versionLabel: string;
  updatedAt: string;
  byteLength: number;
  versionCount: number;
  versions: ReadonlyArray<Readonly<{
    versionId: string;
    sequence: number;
    uploadedAt: string;
    byteLength: number;
    downloadHref: string;
  }>>;
  downloadHref: string;
}>;

export type LibraryCategory = Readonly<{
  key: string;
  label: string;
  description: string;
  documents: ReadonlyArray<LibraryDocument>;
}>;

const CATEGORY_DEFINITIONS = [
  { key: "incorporation", label: "Corporate Records", description: "Formation documents, bylaws, amendments, and corporate filings." },
  { key: "governance", label: "Governance", description: "Board charters, committee materials, decisions, and governance frameworks." },
  { key: "policies", label: "Policies", description: "Board policies and procedures governing operations and conduct." },
  { key: "agreements", label: "Agreements", description: "Contracts, engagement letters, and other binding agreements." },
  { key: BRAND_DOCUMENT_CATEGORY, label: "Brand & Trademark", description: "Brand identity packages, guidelines, manifests, and checksum files." },
] as const;

const definitionByKey = new Map<string, (typeof CATEGORY_DEFINITIONS)[number]>(CATEGORY_DEFINITIONS.map((definition) => [definition.key, definition]));
const brandEntryByTitle = new Map(BRAND_LIBRARY_ENTRIES.map((entry) => [entry.title, entry]));

function titleCaseCategory(category: string) {
  return category.split(/[-_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function collectionForTitle(title: string) {
  const entry = brandEntryByTitle.get(title);
  if (!entry) return null;
  return entry.family === "identity" ? { id: "pgpz-brand-v4", label: "PGPZ Brand v4" } : { id: "pgpz-social-v4", label: "PGPZ Social v4" };
}

function roleForTitle(title: string): LibraryDocumentRole {
  const entry = brandEntryByTitle.get(title);
  if (!entry) return "document";
  if (entry.kind !== "verification") return entry.kind;
  return /checksum/i.test(entry.title) ? "checksum" : "manifest";
}

function typeLabel(document: DocumentItem, role: LibraryDocumentRole) {
  if (role !== "document") return role.charAt(0).toUpperCase() + role.slice(1);
  const extension = document.currentVersion.originalFileName.split(".").pop();
  return extension ? extension.toUpperCase() : "File";
}

function versionLabel(document: DocumentItem) {
  const companion = document.title.match(/Version\s+(\d+).*Companion Version\s+(\d+)/i);
  if (companion) return `v${companion[1]}.${companion[2]}`;
  const titleVersion = document.title.match(/Version\s+(\d+)/i);
  if (titleVersion) return `v${titleVersion[1]}`;
  return `v${document.currentVersion.sequence}`;
}

export function buildDocumentLibrary(
  documents: ReadonlyArray<DocumentItem>,
  versionsByDocument: ReadonlyMap<string, ReadonlyArray<DocumentVersion>> = new Map(),
): ReadonlyArray<LibraryCategory> {
  const documentsByCategory = new Map<string, LibraryDocument[]>();
  for (const document of documents) {
    const definition = definitionByKey.get(document.category);
    const collection = collectionForTitle(document.title);
    const role = roleForTitle(document.title);
    const item: LibraryDocument = {
      documentId: document.documentId,
      title: document.title,
      description: document.description,
      category: document.category,
      categoryLabel: definition?.label ?? titleCaseCategory(document.category),
      collectionId: collection?.id ?? null,
      collectionLabel: collection?.label ?? null,
      role,
      typeLabel: typeLabel(document, role),
      versionLabel: versionLabel(document),
      updatedAt: document.updatedAt,
      byteLength: document.currentVersion.byteLength,
      versionCount: document.versionCount,
      versions: [...(versionsByDocument.get(document.documentId) ?? [document.currentVersion])]
        .sort((left, right) => right.sequence - left.sequence)
        .map((version) => ({
          versionId: version.versionId,
          sequence: version.sequence,
          uploadedAt: version.uploadedAt,
          byteLength: version.byteLength,
          downloadHref: `/api/documents/${document.documentId}/download?version=${encodeURIComponent(version.versionId)}`,
        })),
      downloadHref: `/api/documents/${document.documentId}/download`,
    };
    const current = documentsByCategory.get(document.category) ?? [];
    current.push(item);
    documentsByCategory.set(document.category, current);
  }

  const known = CATEGORY_DEFINITIONS.map((definition) => ({ ...definition, documents: documentsByCategory.get(definition.key) ?? [] })).filter((category) => category.documents.length > 0);
  const unknown = [...documentsByCategory.entries()]
    .filter(([key]) => !definitionByKey.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, categoryDocuments]) => ({ key, label: titleCaseCategory(key), description: "Governed records retained in this document category.", documents: categoryDocuments }));
  return [...known, ...unknown];
}
