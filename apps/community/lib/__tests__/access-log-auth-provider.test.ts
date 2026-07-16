import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    put: mocks.put,
    query: mocks.query,
    update: mocks.update,
  },
}));

const event = ({
  id,
  eventType = "page_view",
  authProvider,
}: {
  id: string;
  eventType?: "login" | "page_view";
  authProvider?: string;
}) => ({
  pk: "ACCESS_LOG#USER#user-1",
  sk: `ACCESS_LOG#2026-07-16T12:00:00.000Z#${id}`,
  GSI1PK: "ACCESS_LOG",
  GSI1SK: `2026-07-16T12:00:00.000Z#${id}`,
  type: "ACCESS_EVENT",
  logId: id,
  createdAt: "2026-07-16T12:00:00.000Z",
  eventType,
  userId: "user-1",
  authProvider,
});

describe("access-log auth provider telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.put.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
  });

  it("persists provider attribution", async () => {
    const { recordAccessEvent } = await import("@/lib/admin/access-log");

    await recordAccessEvent({
      eventType: "page_view",
      userId: "user-1",
      path: "/members",
      authProvider: "next-auth",
    });

    expect(mocks.put).toHaveBeenCalledWith({
      TableName: "TestTable",
      Item: expect.objectContaining({
        authProvider: "next-auth",
      }),
    });
  });

  it("computes complete provider counts over an indexed time range", async () => {
    mocks.query.mockResolvedValue({
      Items: [
        event({ id: "1", authProvider: "better-auth" }),
        event({ id: "2", authProvider: "next-auth" }),
        event({ id: "3", eventType: "login" }),
      ],
    });
    const { listAccessLog } = await import("@/lib/admin/access-log");

    const result = await listAccessLog({
      limit: 2,
      since: "2026-07-01T00:00:00.000Z",
    });

    expect(result.events).toHaveLength(2);
    expect(result.meta).toMatchObject({
      returned: 2,
      totalCount: 3,
      betterAuthCount: 1,
      nextAuthCount: 1,
      unknownAuthProviderCount: 1,
      complete: true,
    });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: "GSI1",
        KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk >= :since",
        ExpressionAttributeValues: expect.objectContaining({
          ":since": "2026-07-01T00:00:00.000Z",
        }),
      }),
    );
  });
});
