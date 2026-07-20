import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamo = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
  transactWrite: vi.fn(),
}));
const semanticQuery = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamo,
  TABLE_NAME: "CommunityTable",
}));
vi.mock("@/lib/x-monitor-server", () => ({
  queryCommunityXMonitorSemantic: semanticQuery,
}));

import {
  CommunityXMonitorSemanticBusyError,
  CommunityXMonitorSemanticLimitError,
  communityXMonitorSemanticCacheKey,
  queryCommunityXMonitorSemanticForMember,
} from "./x-monitor-semantic-guard";

describe("Community X Monitor semantic usage guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamo.get.mockResolvedValue({});
    dynamo.delete.mockResolvedValue({});
    dynamo.put.mockResolvedValue({});
    dynamo.transactWrite.mockResolvedValue({});
    semanticQuery.mockResolvedValue({
      items: [{ status_id: "123", score: 0.8 }],
      next_cursor: null,
    });
  });

  it("normalizes equivalent prompt and filter requests to one cache key", () => {
    expect(communityXMonitorSemanticCacheKey({
      q: "  Privacy   as a Product  ",
      tiers: ["other", "ecosystem"],
      themes: ["Product / ecosystem", "Market / price"],
      handle: "@Example",
      significant: true,
      limit: 999,
    })).toBe(communityXMonitorSemanticCacheKey({
      q: "privacy as a product",
      tiers: ["ecosystem", "other"],
      themes: ["Market / price", "Product / ecosystem"],
      handle: "example",
      significant: true,
      limit: 24,
    }));
  });

  it("serves a fresh cached response without consuming quota or calling upstream", async () => {
    dynamo.get.mockResolvedValueOnce({
      Item: {
        items: [{ status_id: "cached", score: 0.9 }],
        expires: Math.floor(Date.now() / 1000) + 60,
      },
    });

    await expect(queryCommunityXMonitorSemanticForMember(
      { q: "privacy wallets" },
      "member-1",
    )).resolves.toEqual({
      items: [{ status_id: "cached", score: 0.9 }],
      next_cursor: null,
    });
    expect(dynamo.transactWrite).not.toHaveBeenCalled();
    expect(semanticQuery).not.toHaveBeenCalled();
  });

  it("atomically consumes member and client budgets before caching a miss", async () => {
    const query = { q: "privacy wallets", themes: ["Product / ecosystem"] };
    await expect(queryCommunityXMonitorSemanticForMember(query, "member-1"))
      .resolves.toMatchObject({ items: [{ status_id: "123" }] });

    const transaction = dynamo.transactWrite.mock.calls[0]?.[0];
    expect(transaction.TransactItems).toHaveLength(4);
    expect(JSON.stringify(transaction)).not.toContain("member-1");
    expect(dynamo.put.mock.calls[0]?.[0]).toMatchObject({
      Item: { sk: "LOCK", type: "XMONITOR_SEMANTIC_LOCK" },
      ConditionExpression: "attribute_not_exists(pk) OR expires < :now",
    });
    expect(semanticQuery).toHaveBeenCalledWith(query);
    expect(dynamo.put).toHaveBeenCalledWith(expect.objectContaining({
      TableName: "CommunityTable",
      Item: expect.objectContaining({ type: "XMONITOR_SEMANTIC_CACHE" }),
    }));
  });

  it("fails closed when an atomic budget window is exhausted", async () => {
    dynamo.transactWrite.mockRejectedValueOnce(
      Object.assign(new Error("cancelled"), { name: "TransactionCanceledException" }),
    );

    await expect(queryCommunityXMonitorSemanticForMember(
      { q: "privacy wallets" },
      "member-1",
    )).rejects.toBeInstanceOf(CommunityXMonitorSemanticLimitError);
    expect(semanticQuery).not.toHaveBeenCalled();
  });

  it("takes over a released or expired request lock instead of waiting to failure", async () => {
    vi.useFakeTimers();
    dynamo.put.mockRejectedValueOnce(
      Object.assign(new Error("locked"), { name: "ConditionalCheckFailedException" }),
    );

    try {
      const result = queryCommunityXMonitorSemanticForMember(
        { q: "privacy wallets" },
        "member-2",
      );
      await vi.advanceTimersByTimeAsync(500);
      await expect(result).resolves.toMatchObject({ items: [{ status_id: "123" }] });
      expect(semanticQuery).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails fast after one bounded recheck when an identical request remains active", async () => {
    vi.useFakeTimers();
    const locked = Object.assign(new Error("locked"), {
      name: "ConditionalCheckFailedException",
    });
    dynamo.put.mockRejectedValueOnce(locked).mockRejectedValueOnce(locked);

    try {
      const result = queryCommunityXMonitorSemanticForMember(
        { q: "privacy wallets" },
        "member-2",
      );
      const rejection = expect(result).rejects.toBeInstanceOf(
        CommunityXMonitorSemanticBusyError,
      );
      await vi.advanceTimersByTimeAsync(500);
      await rejection;
      expect(dynamo.get).toHaveBeenCalledTimes(2);
      expect(semanticQuery).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a valid upstream result when the best-effort cache write fails", async () => {
    dynamo.put
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("item too large"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(queryCommunityXMonitorSemanticForMember(
      { q: "privacy wallets" },
      "member-1",
    )).resolves.toMatchObject({ items: [{ status_id: "123" }] });
    expect(warning).toHaveBeenCalledWith("[x-monitor-semantic] result cache write failed");
    warning.mockRestore();
  });

  it("returns an empty result without touching quota for an empty prompt", async () => {
    await expect(queryCommunityXMonitorSemanticForMember({}, "member-1"))
      .resolves.toEqual({ items: [], next_cursor: null });
    expect(dynamo.get).not.toHaveBeenCalled();
    expect(dynamo.transactWrite).not.toHaveBeenCalled();
  });
});
