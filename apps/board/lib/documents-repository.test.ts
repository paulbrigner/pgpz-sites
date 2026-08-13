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
    async transactWrite({ TransactItems }: { TransactItems: Array<{ Put?: { Item: Item; ConditionExpression?: string }; Update?: { Key: { pk: string; sk: string }; ExpressionAttributeValues: Record<string, unknown> } }> }) {
      const writes: Array<{ key: string; item: Item }> = [];
      const updates: Array<{ key: string; item: Item }> = [];
      for (const entry of TransactItems) {
        const put = entry.Put;
        if (put) {
          const item = put.Item;
          const key = `${item.pk}#${item.sk}`;
          if (put.ConditionExpression && items.get(key)) throw { name: "ConditionalCheckFailedException" };
          writes.push({ key, item });
        }
        const update = entry.Update;
        if (update) {
          const key = `${update.Key.pk}#${update.Key.sk}`;
          const current = items.get(key);
          const values = update.ExpressionAttributeValues;
          if (!current || current.revision !== values[":expectedRevision"]) throw { name: "ConditionalCheckFailedException" };
          updates.push({ key, item: { ...current, currentVersionId: values[":currentVersionId"], revision: values[":nextRevision"], updatedAt: values[":updatedAt"], updatedBy: values[":updatedBy"] } });
        }
      }
      for (const write of writes) items.set(write.key, write.item);
      for (const update of updates) items.set(update.key, update.item);
    },
    async update({ Key, ExpressionAttributeValues }: { Key: { pk: string; sk: string }; ExpressionAttributeValues: Record<string, unknown> }) {
      const key = `${Key.pk}#${Key.sk}`;
      const current = items.get(key);
      if (!current || current.revision !== ExpressionAttributeValues[":expectedRevision"]) throw { name: "ConditionalCheckFailedException" };
      items.set(key, {
        ...current,
        ...(typeof ExpressionAttributeValues[":displayName"] === "string" ? { displayName: ExpressionAttributeValues[":displayName"] } : {}),
        revision: ExpressionAttributeValues[":nextRevision"],
        updatedAt: ExpressionAttributeValues[":updatedAt"],
        updatedBy: ExpressionAttributeValues[":updatedBy"],
      });
      return {};
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

  it("updates a presentation name without changing canonical document identity", async () => {
    const repo = createBoardDocumentRepository(createFakeClient() as never);
    await repo.createDocument({
      documentId: "brand-package",
      title: "PGPZ Brand Package — Symbol as Z — Version 4",
      description: "Canonical governed package",
      category: "brand-trademark",
      visibility: "members",
      version: version("brand-package", "v1", 1),
      actorId: "user-1",
    });

    const updated = await repo.updateDisplayName("brand-package", "Primary identity package", "user-2");
    expect(updated?.displayName).toBe("Primary identity package");
    expect(updated?.title).toBe("PGPZ Brand Package — Symbol as Z — Version 4");
    await expect(repo.getDocument("brand-package")).resolves.toMatchObject({
      displayName: "Primary identity package",
      title: "PGPZ Brand Package — Symbol as Z — Version 4",
      updatedBy: "user-2",
    });
  });

  it("keeps file version numbers contiguous after presentation metadata changes", async () => {
    const repo = createBoardDocumentRepository(createFakeClient() as never);
    const created = await repo.createDocument({
      documentId: "policy",
      title: "Policy",
      description: "",
      category: "policies",
      visibility: "members",
      version: version("policy", "v1", 1),
      actorId: "user-1",
    });
    const renamed = await repo.updateDisplayName("policy", "Current policy", "user-2");
    const updated = await repo.acceptVersion({
      documentId: "policy",
      expectedRevision: renamed?.revision ?? created.revision,
      head: renamed ?? created,
      version: version("policy", "v2", 99),
      actorId: "user-2",
    });
    expect(updated.currentVersion.sequence).toBe(2);
    expect((await repo.listVersions("policy")).map((item) => item.sequence)).toEqual([1, 2]);
  });
});
