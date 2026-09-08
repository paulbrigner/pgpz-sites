import { describe, expect, it, vi } from "vitest";
import { nextDirectorRoster } from "./director-roster";
import { directorRosterInitializationItem, planDirectorRosterInitialization } from "./director-roster-initialization";
import { createBoardAccessRepository } from "./board-access-repository";
import type { BoardAccessRecord } from "./board-access";
const director = { id: "d1", name: "Director", email: "director@example.invalid", role: "member", status: "active", version: 1 } as BoardAccessRecord;
describe("complete director roster", () => {
  it("requires an explicit bootstrap and never treats a partial new roster as complete", () => {
    const next = nextDirectorRoster(null, director);
    expect(next.ready).toBe(false);
    expect(next.directors).toHaveLength(1);
  });
  it("strongly reads all profile pages and conditionally initializes against the pre-scan revision", async () => {
    const client = { get: vi.fn().mockResolvedValue({ Item: { revision: "before", ready: false, directors: [] } }),
      scan: vi.fn().mockResolvedValueOnce({ Items: [{ ...director, type: "BOARD_ACCESS_PROFILE" }], LastEvaluatedKey: { pk: "next" } }).mockResolvedValueOnce({ Items: [{ ...director, id: "d2", email: "d2@example.invalid", status: "invited", type: "BOARD_ACCESS_PROFILE" }] }) };
    const plan = await planDirectorRosterInitialization(client, "Access");
    expect(plan.roster.directors).toHaveLength(2);
    expect(client.scan.mock.calls[0][0].ConsistentRead).toBe(true);
    expect(client.scan.mock.calls[1][0].ExclusiveStartKey).toEqual({ pk: "next" });
    expect(directorRosterInitializationItem("Access", plan).Put).toMatchObject({ ConditionExpression: "#revision = :revision", ExpressionAttributeValues: { ":revision": "before" } });
  });
  it("atomically adds an invited director and invalidates open collections when access changes", async () => {
    const before = { revision: "before", ready: true, directors: [{ userId: "d1", name: "Director", email: "director@example.invalid", status: "active" }] };
    const client = { get: vi.fn().mockResolvedValue({ Item: before }), transactWrite: vi.fn() };
    const repo = createBoardAccessRepository(client, "Access");
    await repo.create({ id: "d2", name: "Second", email: "second@example.invalid", role: "member", actorEmail: "chair@example.invalid" });
    const transaction = client.transactWrite.mock.calls[0][0].TransactItems;
    expect(transaction).toHaveLength(4);
    const manifest = transaction[3].Put;
    expect(manifest.Item.ready).toBe(true);
    expect(manifest.Item.revision).not.toBe(before.revision);
    expect(manifest.Item.directors).toHaveLength(2);
    expect(manifest.Item.directors[1].status).toBe("invited");
    expect(manifest.ExpressionAttributeValues).toEqual({ ":revision": "before" });
  });
  it("does not overwrite an initialized roster or make scan calls on rerun", async () => {
    const client = { get: vi.fn().mockResolvedValue({ Item: { revision: "ready", ready: true, directors: [] } }), scan: vi.fn() };
    const plan = await planDirectorRosterInitialization(client, "Access");
    expect(plan.alreadyInitialized).toBe(true);
    expect(client.scan).not.toHaveBeenCalled();
    expect(() => directorRosterInitializationItem("Access", plan)).toThrow(/already initialized/);
  });
});
