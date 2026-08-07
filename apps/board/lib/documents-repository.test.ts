import { describe, expect, it } from "vitest";
import type { DocumentVersion } from "@pgpz/document-vault";
import { createBoardDocumentRepository } from "./documents-repository";

type Item = Record<string, unknown>;

function createFakeClient() {
  const items = new Map<string, Item>();
  const client = {
    async get({ Key }: { Key: { pk: string; sk: string } }) {
      return { Item: items.get(`${Key.pk}#${Key.sk}`) };
    },
    async query({ IndexName, ExpressionAttributeValues }: { IndexName?: string; ExpressionAttributeValues: Record<string, unknown> }) {
      if (IndexName === "Library") {
        const lp = ExpressionAttributeValues[":lp"] as string;
        const rows = [...items.values()]
          .filter((item) => item.libraryPk === lp)
          .map((item) => ({ pk: item.pk, sk: item.sk }));
        return { Items: rows, LastEvaluatedKey: undefined };
      }
      const pk = ExpressionAttributeValues[":pk"] as string;
      const prefix = ExpressionAttributeValues[":prefix"] as string;
      const rows = [...items.values()]
        .filter((item) => item.pk === pk && typeof item.sk === "string" && (item.sk as string).startsWith(prefix))
        .sort((a, b) => String(a.sk).localeCompare(String(b.sk)));
      return { Items: rows, LastEvaluatedKey: undefined };
    },
    async transactWrite({ TransactItems }: { TransactItems: Array<{ Put?: { Item: Item; ConditionExpression?: string } }> }) {
      const writes: Array<{ key: string; item: Item }> = [];
      for (const entry of TransactItems) {
        const put = entry.Put;
        if (!put) continue;
        const item = put.Item;
        const key = `${item.pk}#${item.sk}`;
        if (put.ConditionExpression && items.get(key)) throw { name: "ConditionalCheckFailedException" };
        writes.push({ key, item });
      }
      for (const write of writes) items.set(write.key, write.item);
    },
  };
  return client;
}

function version(documentId: string, versionId: string, sequence: number): DocumentVersion {
  return {
    versionId,
    sequence,
    source: "upload",
    restoredFromVersionId: null,
    objectKey: `board/objects/${documentId}/${versionId}`,
    sha256: "0".repeat(64),
    sha256Algorithm: "sha256",
    mimeType: "application/pdf",
    byteLength: 2048,
    originalFileName: "articles.pdf",
    uploadedAt: "2026-08-06T00:00:00.000Z",
    uploadedBy: "user-1",
  };
}

describe("board documents repository", () => {
  it("creates, reads, lists, and versions a document", async () => {
    const repo = createBoardDocumentRepository(createFakeClient() as never);

    const created = await repo.createDocument({
      documentId: "doc-1",
      title: "Articles of Incorporation",
      description: "Founding document",
      category: "incorporation",
      visibility: "members",
      version: version("doc-1", "v1", 1),
      actorId: "user-1",
    });
    expect(created.title).toBe("Articles of Incorporation");
    expect(created.currentVersion.versionId).toBe("v1");

    const read = await repo.getDocument("doc-1");
    expect(read?.documentId).toBe("doc-1");
    expect(read?.category).toBe("incorporation");

    const listed = await repo.listDocuments({ status: "active" });
    expect(listed.map((item) => item.documentId)).toContain("doc-1");

    const versions = await repo.listVersions("doc-1");
    expect(versions.map((v) => v.versionId)).toEqual(["v1"]);
  });

  it("round-trips version metadata", async () => {
    const repo = createBoardDocumentRepository(createFakeClient() as never);
    await repo.createDocument({
      documentId: "doc-2",
      title: "Board Agreement",
      description: "",
      category: "agreements",
      visibility: "members",
      version: version("doc-2", "v1", 1),
      actorId: "user-1",
    });
    const read = await repo.getDocument("doc-2");
    expect(read?.currentVersion.originalFileName).toBe("articles.pdf");
    expect(read?.currentVersion.sha256).toHaveLength(64);
  });
});
