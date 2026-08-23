import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildObjectKey, buildStagingKey } from "@pgpz/document-vault";
import { createLocalBoardDocumentObjectStore } from "./object-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function localStore() {
  const root = await mkdtemp(join(tmpdir(), "pgpz-board-documents-"));
  roots.push(root);
  return { root, store: createLocalBoardDocumentObjectStore(root) };
}

describe("local Board document object store", () => {
  it("stages, promotes, reads, and removes only the staging copy", async () => {
    const { store } = await localStore();
    const stagingKey = buildStagingKey("board", "11111111-1111-4111-8111-111111111111");
    const retainedKey = buildObjectKey("board", "22222222-2222-4222-8222-222222222222", "version-1");
    const bytes = new TextEncoder().encode("governed meeting material");

    const staged = await store.writeStaged?.(stagingKey, bytes, "text/plain");
    expect(staged).toMatchObject({ byteLength: bytes.byteLength, mimeType: "text/plain" });
    await expect(store.readStaged(stagingKey)).resolves.toMatchObject({ metadata: staged });

    await store.promote(stagingKey, retainedKey);
    await store.deleteStaging(stagingKey);
    await expect(store.readStaged(stagingKey)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.readRetained?.(retainedKey)).resolves.toMatchObject({
      bytes: Buffer.from(bytes),
      metadata: staged,
    });
  });

  it("never overwrites an immutable retained version", async () => {
    const { store } = await localStore();
    const firstStage = buildStagingKey("board", "11111111-1111-4111-8111-111111111111");
    const secondStage = buildStagingKey("board", "33333333-3333-4333-8333-333333333333");
    const retainedKey = buildObjectKey("board", "22222222-2222-4222-8222-222222222222", "version-1");
    await store.writeStaged?.(firstStage, new TextEncoder().encode("first"), "text/plain");
    await store.writeStaged?.(secondStage, new TextEncoder().encode("second"), "text/plain");
    await store.promote(firstStage, retainedKey);

    await expect(store.promote(secondStage, retainedKey)).rejects.toMatchObject({ code: "EEXIST" });
    expect((await store.readRetained?.(retainedKey))?.bytes.toString()).toBe("first");
  });

  it("detects local retained-byte tampering", async () => {
    const { root, store } = await localStore();
    const stagingKey = buildStagingKey("board", "11111111-1111-4111-8111-111111111111");
    const retainedKey = buildObjectKey("board", "22222222-2222-4222-8222-222222222222", "version-1");
    await store.writeStaged?.(stagingKey, new TextEncoder().encode("original"), "text/plain");
    await store.promote(stagingKey, retainedKey);
    await writeFile(join(root, retainedKey), "changed");

    await expect(store.readRetained?.(retainedKey)).rejects.toThrow(
      "Local document bytes do not match their retained metadata.",
    );
  });

  it("rejects traversal and non-Board object keys", async () => {
    const { root, store } = await localStore();
    await expect(store.readStaged("board/staging/../../secret")).rejects.toThrow("invalid staging key");
    await expect(store.readRetained?.("coalition/objects/x/y")).rejects.toThrow("invalid retained object key");
    await expect(readFile(join(root, "secret"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
