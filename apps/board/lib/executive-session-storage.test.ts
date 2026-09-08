// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalBoardDocumentObjectStore, type BoardDocumentObjectStore } from "./object-store";
import { retainExecutiveMaterial, readExecutiveMaterial } from "./executive-session-storage";

const state = vi.hoisted(() => ({ store: {} as BoardDocumentObjectStore }));
vi.mock("@/lib/object-store", async (original) => {
  const actual = await original<typeof import("./object-store")>();
  return { ...actual, boardDocumentObjectStore: new Proxy({}, { get: (_, key) => state.store[key as keyof BoardDocumentObjectStore] }) };
});
let root: string;
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), "board-executive-test-")); state.store = createLocalBoardDocumentObjectStore(root); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("private retained material", () => {
  it("validates bytes, promotes a server-owned staging key, and verifies retained integrity", async () => {
    const file = new File(["Private compensation comparables"], "comparables.txt", { type: "text/plain" });
    const material = await retainExecutiveMaterial(file, "Schedule A", "director");
    expect(material.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Buffer.from(await readExecutiveMaterial(material)).toString()).toBe("Private compensation comparables");
    await expect(readExecutiveMaterial({ ...material, sha256: "changed" })).rejects.toThrow(/integrity/);
  });
  it("rejects disguised executables, mismatched types, empty and oversized files", async () => {
    for (const file of [new File(["MZ executable"], "fake.pdf", { type: "application/pdf" }),
      new File(["plain"], "fake.zip", { type: "text/plain" }), new File([], "empty.txt", { type: "text/plain" }),
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.txt", { type: "text/plain" })]) {
      await expect(retainExecutiveMaterial(file, "Test", "director")).rejects.toMatchObject({ status: 400 });
    }
  });
});
