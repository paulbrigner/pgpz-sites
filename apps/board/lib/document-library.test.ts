import { describe, expect, it } from "vitest";
import type { DocumentItem } from "@pgpz/document-vault";
import { buildDocumentLibrary } from "@/lib/document-library";
import type { BoardDocumentItem } from "@/lib/documents-repository";

function document(overrides: Partial<BoardDocumentItem> & Pick<DocumentItem, "documentId" | "title" | "category">): BoardDocumentItem {
  return {
    description: "A retained record", visibility: "members", status: "active", revision: 1, currentVersionId: "version-id",
    createdBy: "actor", createdAt: "2026-08-12T00:00:00.000Z", updatedBy: "actor", updatedAt: "2026-08-12T00:00:00.000Z", versionCount: 1,
    currentVersion: { versionId: "version-id", sequence: 1, source: "upload", restoredFromVersionId: null, objectKey: "objects/file.pdf", sha256: "a".repeat(64), sha256Algorithm: "sha256", mimeType: "application/pdf", byteLength: 1024, originalFileName: "file.pdf", uploadedAt: "2026-08-12T00:00:00.000Z", uploadedBy: "actor" },
    ...overrides,
  };
}

describe("Board document library presentation", () => {
  it("uses human-readable folders and associates integrity records with their package", () => {
    const categories = buildDocumentLibrary([
      document({ documentId: "articles", title: "Articles of Incorporation", category: "incorporation" }),
      document({ documentId: "package", title: "PGPZ Brand Package — Symbol as Z — Version 4", category: "brand-trademark" }),
      document({ documentId: "manifest", title: "PGPZ Brand Package Manifest — Version 4", category: "brand-trademark" }),
      document({ documentId: "checksums", title: "PGPZ Brand Package Checksums — Version 4", category: "brand-trademark" }),
    ]);
    expect(categories.map((category) => category.label)).toEqual(["Corporate Records", "Brand & Trademark"]);
    const brand = categories.find((category) => category.key === "brand-trademark");
    expect(new Set(brand?.documents.map((item) => item.collectionId))).toEqual(new Set(["pgpz-brand-v4"]));
    expect(brand?.documents.find((item) => item.documentId === "manifest")?.role).toBe("manifest");
    expect(brand?.documents.find((item) => item.documentId === "checksums")?.role).toBe("checksum");
  });

  it("keeps unknown app-owned categories visible with a readable label", () => {
    const categories = buildDocumentLibrary([document({ documentId: "minutes", title: "August minutes", category: "meeting-minutes" })]);
    expect(categories[0]).toMatchObject({ key: "meeting-minutes", label: "Meeting Minutes" });
  });

  it("uses a mutable display name without breaking canonical brand relationships", () => {
    const categories = buildDocumentLibrary([
      document({
        documentId: "package",
        title: "PGPZ Brand Package — Symbol as Z — Version 4",
        displayName: "Primary PGPZ identity package",
        category: "brand-trademark",
      }),
    ]);
    expect(categories[0]?.documents[0]).toMatchObject({
      title: "Primary PGPZ identity package",
      collectionId: "pgpz-brand-v4",
      role: "package",
      versionLabel: "v4",
    });
  });
});
