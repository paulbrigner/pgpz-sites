import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getAppUserById: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: { query: mocks.query },
  TABLE_NAME: "TestTable",
}));
vi.mock("@/lib/app-users", () => ({
  getAppUserById: mocks.getAppUserById,
  userKey: (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` }),
}));

import { listVisibleMemberProfiles } from "@/lib/member-profiles";

describe("Community member directory projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({
      Items: [{
        ownerUserId: "member-1",
        slug: "ada",
        name: "Ada",
        headline: "Researcher",
        status: "published",
      }],
    });
    mocks.getAppUserById.mockResolvedValue({
      id: "member-1",
      membershipStatus: "active",
      memberDirectoryOptIn: true,
      memberProfileSlug: "ada",
    });
  });

  it("rechecks owners with the compute role's permitted consistent GetItem path", async () => {
    await expect(listVisibleMemberProfiles()).resolves.toEqual([
      expect.objectContaining({ slug: "ada", name: "Ada" }),
    ]);
    expect(mocks.getAppUserById).toHaveBeenCalledWith("member-1", { consistentRead: true });
  });

  it("removes a projection when its owner is no longer an active opted-in member", async () => {
    mocks.getAppUserById.mockResolvedValueOnce({
      id: "member-1",
      membershipStatus: "none",
      memberDirectoryOptIn: true,
      memberProfileSlug: "ada",
    });
    await expect(listVisibleMemberProfiles()).resolves.toEqual([]);
  });
});
