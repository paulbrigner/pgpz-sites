import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  configureAccessLogRuntime,
  getAccessLogRequestMetadata,
  listAccessLog,
  recordAccessEvent,
} from "./runtime";

const documentClient = {
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
};

describe("access-log runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureAccessLogRuntime({ documentClient, tableName: "AccessLogTest" });
    documentClient.put.mockResolvedValue({});
    documentClient.update.mockResolvedValue({});
    documentClient.query.mockResolvedValue({ Items: [] });
  });

  it("normalizes proxy and user-agent request metadata", () => {
    const headers = new Headers({
      "x-forwarded-for": " 203.0.113.7, 10.0.0.2",
      "user-agent": "Test Browser",
    });

    expect(getAccessLogRequestMetadata(headers)).toEqual({
      ipAddress: "203.0.113.7",
      userAgent: "Test Browser",
    });
  });

  it("records a normalized page view and updates the app-owned user record", async () => {
    const event = await recordAccessEvent({
      eventType: "page_view",
      userId: "member-1",
      authProvider: "better-auth",
      path: "/updates?view=latest",
      title: "Updates",
    });

    expect(event).toMatchObject({
      eventType: "page_view",
      userId: "member-1",
      authProvider: "better-auth",
      path: "/updates?view=latest",
    });
    expect(documentClient.put).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "AccessLogTest",
        Item: expect.objectContaining({ GSI1PK: "ACCESS_LOG" }),
      }),
    );
    expect(documentClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "AccessLogTest",
        Key: { pk: "USER#member-1", sk: "USER#member-1" },
      }),
    );
  });

  it("summarizes authentication providers without crossing the configured table", async () => {
    documentClient.query.mockResolvedValue({
      Items: [
        {
          logId: "one",
          eventType: "login",
          createdAt: "2026-08-10T12:00:00.000Z",
          userId: "member-1",
          authProvider: "better-auth",
        },
        {
          logId: "two",
          eventType: "page_view",
          createdAt: "2026-08-10T12:01:00.000Z",
          userId: "member-2",
          authProvider: "next-auth",
          path: "/",
        },
      ],
    });

    await expect(listAccessLog()).resolves.toMatchObject({
      meta: {
        totalCount: 2,
        betterAuthCount: 1,
        nextAuthCount: 1,
        uniqueMemberCount: 2,
      },
    });
    expect(documentClient.query).toHaveBeenCalledWith(
      expect.objectContaining({ TableName: "AccessLogTest" }),
    );
  });
});
