import { describe, expect, it } from "vitest";
import { createBoardAccessRepository } from "./board-access-repository";

const existing = {
  pk: "ACCESS#a1",
  sk: "PROFILE",
  type: "BOARD_ACCESS_PROFILE",
  id: "a1",
  email: "director@pgpz.org",
  name: "Director",
  role: "member",
  status: "active",
  version: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "admin@pgpz.org",
  updatedAt: "2026-01-02T00:00:00.000Z",
  updatedBy: "admin@pgpz.org",
  activatedAt: "2026-01-01T00:00:00.000Z",
  deactivatedAt: null,
  sessionsRevokedAt: null,
  rosterPk: "BOARD_ACCESS",
  rosterSk: "director@pgpz.org#a1",
};

function fakeClient() {
  const calls: Array<{ method: string; input: Record<string, unknown> }> = [];
  let getResponses: unknown[] = [];
  let queryResponse: Record<string, unknown> = { Items: [] };
  return {
    calls,
    queueGets(...responses: unknown[]) { getResponses = [...responses]; },
    setQuery(response: Record<string, unknown>) { queryResponse = response; },
    client: {
      async get(input: Record<string, unknown>) {
        calls.push({ method: "get", input });
        return getResponses.shift() || {};
      },
      async query(input: Record<string, unknown>) {
        calls.push({ method: "query", input });
        return queryResponse;
      },
      async transactWrite(input: Record<string, unknown>) {
        calls.push({ method: "transactWrite", input });
        return {};
      },
    },
  };
}

describe("Board access repository", () => {
  it("normalizes email lookup through the unique claim", async () => {
    const fake = fakeClient();
    fake.queueGets({ Item: { accessId: "a1" } }, { Item: existing });
    const repository = createBoardAccessRepository(fake.client, "AccessTable");
    await expect(repository.getByEmail(" DIRECTOR@PGPZ.ORG ")).resolves.toMatchObject({ id: "a1", email: "director@pgpz.org" });
    expect(fake.calls[0].input).toMatchObject({ Key: { pk: "EMAIL#director@pgpz.org", sk: "CLAIM" }, ConsistentRead: true });
  });

  it("builds an atomic unique claim, profile, and immutable creation revision", () => {
    const repository = createBoardAccessRepository(fakeClient().client, "AccessTable");
    const mutation = repository.buildCreateItems({
      id: "a1",
      email: " Director@PGPZ.org ",
      name: "Director",
      role: "member",
      status: "active",
      actorEmail: "admin@pgpz.org",
      occurredAt: "2026-02-01T00:00:00.000Z",
    });
    expect(mutation.record).toMatchObject({ email: "director@pgpz.org", status: "active", version: 1 });
    expect(mutation.transactItems).toHaveLength(3);
    expect(mutation.transactItems[0]).toMatchObject({ Put: { TableName: "AccessTable", Item: { pk: "EMAIL#director@pgpz.org", accessId: "a1" } } });
    expect(JSON.stringify(mutation.transactItems)).toContain("BOARD_ACCESS_REVISION");
  });

  it("uses optimistic version checks and preserves immutable revisions for changes", async () => {
    const fake = fakeClient();
    fake.queueGets({ Item: existing });
    const repository = createBoardAccessRepository(fake.client, "AccessTable");
    const mutation = await repository.buildStatusChangeItems({
      id: "a1",
      expectedVersion: 2,
      status: "deactivated",
      actorEmail: "admin@pgpz.org",
      reason: "Board term ended",
      occurredAt: "2026-03-01T00:00:00.000Z",
    });
    expect(mutation.record).toMatchObject({ version: 3, status: "deactivated", deactivatedAt: "2026-03-01T00:00:00.000Z" });
    expect(mutation.revision).toMatchObject({ action: "status-changed", previousStatus: "active", status: "deactivated" });
    expect(mutation.transactItems[0]).toMatchObject({ Put: { ExpressionAttributeValues: { ":expectedVersion": 2, ":email": "director@pgpz.org" } } });
  });

  it("composes access and audit items in one transaction", async () => {
    const fake = fakeClient();
    const repository = createBoardAccessRepository(fake.client, "AccessTable");
    const mutation = repository.buildCreateItems({
      id: "a1", email: "director@pgpz.org", name: "Director", role: "member",
      actorEmail: "admin@pgpz.org", occurredAt: "2026-02-01T00:00:00.000Z",
    });
    await repository.execute(mutation, { additionalTransactItems: [{ Put: { TableName: "AuditTable" } }] });
    const transaction = fake.calls.find((call) => call.method === "transactWrite")?.input.TransactItems as unknown[];
    expect(transaction).toHaveLength(4);
    expect(transaction[3]).toEqual({ Put: { TableName: "AuditTable" } });
  });

  it("lists through the roster index without scanning", async () => {
    const fake = fakeClient();
    fake.setQuery({ Items: [existing], LastEvaluatedKey: { pk: "next" } });
    const repository = createBoardAccessRepository(fake.client, "AccessTable");
    const page = await repository.list({ status: "active", role: "member", limit: 20 });
    expect(page.records).toHaveLength(1);
    expect(page.cursor).toEqual({ pk: "next" });
    expect(fake.calls[0].input).toMatchObject({ IndexName: "Roster", Limit: 20, FilterExpression: "#status = :status AND #role = :role" });
  });
});
