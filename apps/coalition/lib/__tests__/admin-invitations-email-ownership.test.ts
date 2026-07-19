import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  query: vi.fn(),
  transactWrite: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: mocks,
}));
vi.mock("@/lib/config", () => ({ SITE_URL: "https://coalition.example" }));
vi.mock("@/lib/community-sync", () => ({
  syncCoalitionMemberToCommunityById: vi.fn(),
}));

describe("invited-member email ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ Items: [] });
    mocks.transactWrite.mockResolvedValue({});
  });

  it("creates the app user and normalized claim atomically", async () => {
    const { createInvitedMember } = await import("@/lib/admin/invitations");

    const member = await createInvitedMember({
      email: " Invited@Example.Test ",
      firstName: "Invited",
      lastName: "Member",
      company: "Example",
      jobTitle: "Policy Lead",
      adminUserId: "admin-1",
    });

    const items = mocks.transactWrite.mock.calls[0][0].TransactItems;
    expect(items).toHaveLength(2);
    expect(items[0].Update).toMatchObject({
      Key: {
        pk: "EMAIL_OWNERSHIP#invited@example.test",
        sk: "EMAIL_OWNERSHIP#invited@example.test",
      },
      ExpressionAttributeValues: expect.objectContaining({
        ":email": "invited@example.test",
        ":appUserId": member.id,
      }),
    });
    expect(items[1].Put.Item).toMatchObject({
      id: member.id,
      type: "USER",
      email: "invited@example.test",
      membershipStatus: "invited",
    });
  });

  it("returns a stable collision when a concurrent writer owns the email", async () => {
    mocks.transactWrite.mockRejectedValueOnce({ name: "TransactionCanceledException" });
    const { createInvitedMember, InvitationError } = await import("@/lib/admin/invitations");

    await expect(
      createInvitedMember({
        email: "invited@example.test",
        firstName: "Invited",
        lastName: "Member",
        company: "Example",
        jobTitle: "Policy Lead",
      }),
    ).rejects.toMatchObject({
      constructor: InvitationError,
      status: 409,
      message: "A member with this email already exists.",
    });
  });
});
