import { describe, expect, it } from "vitest";
import type { DocumentVersion } from "../domain";
import { createInMemoryDocumentRepository, seedReferenceDocuments } from "./inmemory";
import { OptimisticConcurrencyError } from "./repository";

function version(versionId = "v1", sequence = 1): DocumentVersion {
  return {
    versionId,
    sequence,
    source: "upload",
    restoredFromVersionId: null,
    objectKey: `board/objects/doc-1/${versionId}`,
    sha256: "0".repeat(64),
    sha256Algorithm: "sha256",
    mimeType: "application/pdf",
    byteLength: 100,
    originalFileName: "a.pdf",
    uploadedAt: "2026-08-06T00:00:00.000Z",
    uploadedBy: "user-1",
  };
}

describe("in-memory document repository", () => {
  it("creates, lists, and reads a document", async () => {
    const repo = createInMemoryDocumentRepository();
    const created = await repo.createDocument({
      documentId: "doc-1",
      title: "Articles",
      description: "Founding",
      category: "incorporation",
      visibility: "members",
      version: version(),
      actorId: "user-1",
    });

    const read = await repo.getDocument("doc-1");
    expect(read?.title).toBe("Articles");
    expect(read?.currentVersion.versionId).toBe("v1");
    expect((await repo.listDocuments()).length).toBe(1);
    expect(created.revision).toBe(0);
  });

  it("appends an immutable version and bumps revision with optimistic concurrency", async () => {
    const repo = createInMemoryDocumentRepository();
    await repo.createDocument({ documentId: "doc-1", title: "T", description: "", category: "c", visibility: "members", version: version("v1", 1), actorId: "u" });

    const next = version("v2", 2);
    const updated = await repo.acceptVersion({ documentId: "doc-1", expectedRevision: 0, head: await repo.getDocument("doc-1") as never, version: next, actorId: "user-2" });
    expect(updated.revision).toBe(1);
    expect(updated.currentVersionId).toBe("v2");
    expect((await repo.listVersions("doc-1")).length).toBe(2);
  });

  it("rejects a stale concurrent write", async () => {
    const repo = createInMemoryDocumentRepository();
    await repo.createDocument({ documentId: "doc-1", title: "T", description: "", category: "c", visibility: "members", version: version("v1", 1), actorId: "u" });
    await repo.acceptVersion({ documentId: "doc-1", expectedRevision: 0, head: null as never, version: version("v2", 2), actorId: "u" });

    // Second writer still holds expectedRevision 0 -> conflict.
    await expect(
      repo.acceptVersion({ documentId: "doc-1", expectedRevision: 0, head: null as never, version: version("v3", 3), actorId: "u" }),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });

  it("archives without deleting content", async () => {
    const repo = createInMemoryDocumentRepository();
    await repo.createDocument({ documentId: "doc-1", title: "T", description: "", category: "c", visibility: "members", version: version(), actorId: "u" });
    const archived = await repo.setArchived("doc-1", true, "u", "2026-08-06T00:00:00.000Z");
    expect(archived?.status).toBe("archived");
    expect(await repo.getDocument("doc-1")).not.toBeNull();
  });

  it("seeds deterministic read-only reference fixtures", async () => {
    const repo = createInMemoryDocumentRepository();
    const items = await seedReferenceDocuments(repo);
    expect(items.map((item) => item.title)).toEqual([
      "Reference Articles of Incorporation",
      "Reference Board Agreement",
      "Reference Conflict of Interest Policy",
    ]);
    expect((await repo.listDocuments({ status: "active" })).length).toBe(3);
  });
});
