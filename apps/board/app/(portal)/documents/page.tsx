import { Badge, Container } from "@pgpz/ui";
import { DocumentLibrary } from "@/components/documents/DocumentLibrary";
import { buildDocumentLibrary } from "@/lib/document-library";
import { canManageBoardDocuments, requireBoardMember } from "@/lib/session";
import { boardDocumentRepository } from "@/lib/vault";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Document Library",
  robots: { index: false, follow: false, nocache: true },
};

export default async function BoardDocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const member = await requireBoardMember("/documents");
  if (!member) return null;
  const params = await searchParams;
  const rawDocumentId = params?.document;
  const focusDocumentId = Array.isArray(rawDocumentId) ? rawDocumentId[0] : rawDocumentId;
  const rawHistory = params?.history;
  const showHistory = (Array.isArray(rawHistory) ? rawHistory[0] : rawHistory) === "1";
  const canManage = canManageBoardDocuments(member);
  const documents = await boardDocumentRepository.listDocuments(canManage ? undefined : { status: "active" });
  const versionsByDocument = new Map(
    await Promise.all(
      documents
        .filter((document) => document.versionCount > 1 || document.documentId === focusDocumentId)
        .map(async (document) => [document.documentId, await boardDocumentRepository.listVersions(document.documentId)] as const),
    ),
  );
  const categories = buildDocumentLibrary(documents, versionsByDocument);

  return (
    <Container className="max-w-[90rem] py-2 sm:px-8 sm:py-3 lg:px-12">
      <section className="max-w-6xl">
        <Badge tone="accent">Governance vault</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Document library
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--muted)]">
          Browse Board records by category, collection, or keyword. Signed in as{" "}
          <span className="font-semibold text-[var(--foreground)]">{member.email}</span>.
        </p>
      </section>

      <DocumentLibrary categories={categories} focusDocumentId={focusDocumentId} showFocusedHistory={showHistory} canManage={canManage} />
    </Container>
  );
}
