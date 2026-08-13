import { Badge, Container } from "@pgpz/ui";
import { notFound } from "next/navigation";
import { requireBoardAdministration, canManageBoardDocuments } from "@/lib/session";
import { boardDocumentRepository } from "@/lib/vault";
import { DocumentManager } from "@/components/documents/DocumentManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Document Management",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminDocumentsPage() {
  const administrator = await requireBoardAdministration("/admin/documents");
  if (!canManageBoardDocuments(administrator)) notFound();

  const documents = await boardDocumentRepository.listDocuments();

  const serialized = documents.map((document) => ({
    documentId: document.documentId,
    title: document.title,
    description: document.description,
    category: document.category,
    status: document.status,
    versionCount: document.versionCount,
    currentVersion: {
      versionId: document.currentVersion.versionId,
      fileName: document.currentVersion.originalFileName,
      byteLength: document.currentVersion.byteLength,
    },
  }));

  return (
    <Container className="py-12 sm:py-16">
      <section className="max-w-4xl">
        <Badge tone="accent">Governance vault</Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Manage documents
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
          Add Board records, publish updated versions, or archive documents that are no longer current.
        </p>
      </section>
      <DocumentManager documents={serialized} />
    </Container>
  );
}
