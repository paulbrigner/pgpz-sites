import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { Badge, Container, Surface } from "@pgpz/ui";
import { formatBytes } from "@pgpz/document-vault";
import { requireBoardMember } from "@/lib/session";
import { boardDocumentRepository } from "@/lib/vault";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Document Library",
  robots: { index: false, follow: false, nocache: true },
};

export default async function BoardDocumentsPage() {
  const member = await requireBoardMember("/documents");
  if (!member) return null;
  const documents = await boardDocumentRepository.listDocuments({ status: "active" });

  return (
    <Container className="py-12 sm:py-16">
      <section className="max-w-4xl">
        <Badge tone="accent">Governance vault</Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Document library
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
          Founding documents, agreements, and policies preserved for the board. Signed in as{" "}
          <span className="font-semibold text-[var(--foreground)]">{member.email}</span>.
        </p>
      </section>

      {documents.length === 0 ? (
        <Surface className="mt-8 max-w-4xl p-8">
          <p className="text-sm text-[var(--muted)]">No governance documents have been published yet.</p>
        </Surface>
      ) : (
        <ul className="mt-8 grid max-w-4xl gap-4">
          {documents.map((document) => (
            <li key={document.documentId}>
              <Surface className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--foreground)]">{document.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{document.description}</p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {document.category} · v{document.currentVersion.versionId.slice(0, 8)} ·{" "}
                      {formatBytes(document.currentVersion.byteLength)}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/api/documents/${document.documentId}/download`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  View
                </Link>
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
