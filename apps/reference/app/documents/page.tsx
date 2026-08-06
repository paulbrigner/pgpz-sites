import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { createInMemoryDocumentRepository, seedReferenceDocuments } from "@pgpz/document-vault/server";
import { formatBytes } from "@pgpz/document-vault";

export const metadata: Metadata = {
  title: "Document Vault (reference)",
  description: "Synthetic read-only demonstration of the shared document vault package.",
};

export default async function ReferenceDocumentsPage() {
  // Deterministic, read-only: seeds an in-memory repository. No auth, no AWS,
  // no write routes — proof that the neutral package renders under Reference
  // fixtures without app-to-app imports or shared data.
  const repository = createInMemoryDocumentRepository();
  const documents = await seedReferenceDocuments(repository);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <p style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontSize: "0.75rem", fontWeight: 700 }}>
        Reference · Read-only
      </p>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0" }}>Document vault (synthetic)</h1>
      <p style={{ color: "#5a6a6a", maxWidth: 640 }}>
        This page demonstrates the shared <code>@pgpz/document-vault</code> package rendering under
        deterministic in-memory fixtures — no authentication, no AWS resources, and no write routes.
      </p>

      <ul style={{ listStyle: "none", padding: 0, marginTop: "1.5rem" }}>
        {documents.map((document) => (
          <li
            key={document.documentId}
            style={{ display: "flex", gap: "1rem", alignItems: "center", border: "1px solid #e3e8e4", borderRadius: 12, padding: "1rem", marginBottom: "0.75rem" }}
          >
            <FileText size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: 600, margin: 0 }}>{document.title}</p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#5a6a6a" }}>
                {document.category} · {formatBytes(document.currentVersion.byteLength)} · {document.versionCount} version{document.versionCount === 1 ? "" : "s"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
