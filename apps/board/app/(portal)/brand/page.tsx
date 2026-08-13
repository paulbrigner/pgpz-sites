import Link from "next/link";
import { Archive, BookOpen, Download, Package } from "lucide-react";
import { Badge, Container, Surface } from "@pgpz/ui";
import { formatBytes, type DocumentItem } from "@pgpz/document-vault";
import { requireBoardMember } from "@/lib/session";
import { boardDocumentRepository } from "@/lib/vault";
import { BRAND_DOCUMENT_CATEGORY, BRAND_LIBRARY_ENTRIES, type BrandLibraryEntry } from "@/lib/brand-library";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Brand & Marketing",
  robots: { index: false, follow: false, nocache: true },
};

function DownloadCard({ entry, document }: { entry: BrandLibraryEntry; document?: DocumentItem }) {
  const Icon = entry.kind === "package" ? Package : BookOpen;
  return (
    <Surface className="flex h-full flex-col p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <Badge>{entry.kind === "package" ? "Complete package" : "Guidelines"}</Badge>
      </div>
      <h3 className="mt-6 text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">{entry.title}</h3>
      <p className="mt-3 flex-1 text-sm leading-7 text-[var(--muted)]">{entry.description}</p>
      {document ? (
        <div className="mt-6">
          <p className="mb-3 text-xs text-[var(--muted)]">
            Current vault version · {formatBytes(document.currentVersion.byteLength)}
          </p>
          <a
            href={`/api/documents/${document.documentId}/download`}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {entry.kind === "package" ? "Download package" : "View guidelines"}
          </a>
          <Link
            href={`/documents?document=${encodeURIComponent(document.documentId)}&history=1#document-${encodeURIComponent(document.documentId)}`}
            className="ml-4 inline-flex text-xs font-semibold text-[var(--primary)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--primary)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            View record &amp; version history
          </Link>
        </div>
      ) : (
        <p className="mt-6 text-xs font-semibold text-[var(--muted)]">The governed file is being prepared.</p>
      )}
    </Surface>
  );
}

export default async function BrandMarketingPage() {
  const member = await requireBoardMember("/brand");
  if (!member) return null;

  const documents = await boardDocumentRepository.listDocuments({ category: BRAND_DOCUMENT_CATEGORY, status: "active" });
  const byTitle = new Map(documents.map((document) => [document.title, document]));
  const primaryEntries = BRAND_LIBRARY_ENTRIES.filter((entry) => entry.kind === "guidelines" || entry.kind === "package");

  return (
    <Container className="py-12 sm:py-16">
      <section className="max-w-4xl">
        <Badge tone="accent">Current-use materials</Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Brand &amp; marketing
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--muted)]">
          Current identity guidelines and production packages for PGPZ communications.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="brand-current-materials">
        <div className="flex items-center gap-3">
          <Archive className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
          <h2 id="brand-current-materials" className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            Guidelines and production packages
          </h2>
        </div>
        <div className="mt-5 grid max-w-6xl gap-4 md:grid-cols-2">
          {primaryEntries.map((entry) => <DownloadCard key={entry.key} entry={entry} document={byTitle.get(entry.title)} />)}
        </div>
      </section>

      <p className="mt-8 text-sm text-[var(--muted)]">
        Looking for manifests, checksums, trademark records, or another Board document? <Link href="/documents" className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Open the Document Library</Link>.
      </p>
    </Container>
  );
}
