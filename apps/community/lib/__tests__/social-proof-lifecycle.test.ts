import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  transactWrite: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/config", () => ({
  MEMBERSHIP_PROOF_RETENTION_POLICY: "indefinite",
  SITE_URL: "https://community.example.test",
  X_API_BASE_URL: "https://api.x.example.test",
  X_API_TIMEOUT_MS: 1_000,
  X_BEARER_TOKEN: "test-token",
  X_PROOF_AUTOVERIFY_BATCH_SIZE: 10,
  X_PROOF_AUTOVERIFY_GROUP_SIZE: 5,
  X_PROOF_AUTOVERIFY_MAX_ATTEMPTS: 5,
  X_PROOF_AUTOVERIFY_WINDOW_MINUTES: 60,
  X_PROOF_CHALLENGE_RATE_LIMIT: 5,
  X_PROOF_CHALLENGE_TTL_MINUTES: 15,
  X_PROOF_RATE_LIMIT_WINDOW_MINUTES: 15,
  X_PROOF_VERIFY_RATE_LIMIT: 5,
}));

import { createXChallenge } from "@/lib/social-proof";

describe("social proof account lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { membershipStatus: "none", accountStatus: "deactivated" },
    {
      membershipStatus: "none",
      accountStatus: "active",
      deactivatedAt: "2026-07-19T00:00:00.000Z",
    },
  ])("does not create membership proof challenges for deactivated accounts", async (item) => {
    dynamoMocks.get.mockResolvedValue({ Item: item });

    await expect(createXChallenge("user-1")).rejects.toMatchObject({
      message: "This account is deactivated.",
      status: 409,
    });
    expect(dynamoMocks.query).not.toHaveBeenCalled();
    expect(dynamoMocks.put).not.toHaveBeenCalled();
  });
});
