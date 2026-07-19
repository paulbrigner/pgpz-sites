import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  query: vi.fn(),
  transactWrite: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: mocks,
}));

describe("application-user email ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ Items: [] });
    mocks.get.mockResolvedValue({});
    mocks.transactWrite.mockResolvedValue({});
  });

  it("binds legitimate application and Better Auth users whose ids differ", async () => {
    mocks.query.mockResolvedValueOnce({
      Items: [{ id: "app-user-1", email: "member@example.test", type: "USER" }],
    });
    mocks.get.mockImplementation(async ({ Key }) =>
      String(Key.pk).startsWith("BETTER_AUTH#")
        ? { Item: { id: "better-user-1", email: "member@example.test" } }
        : {},
    );
    const { ensureAppUserForEmail } = await import("@/lib/app-users");

    await expect(
      ensureAppUserForEmail({
        email: "Member@Example.Test",
        preferredUserId: "better-user-1",
      }),
    ).resolves.toMatchObject({ id: "app-user-1" });

    const claim = mocks.transactWrite.mock.calls[0][0].TransactItems[0].Update;
    expect(claim.ExpressionAttributeValues).toMatchObject({
      ":email": "member@example.test",
      ":appUserId": "app-user-1",
      ":betterAuthUserId": "better-user-1",
    });
  });

  it("creates the application identity and claim in one transaction", async () => {
    mocks.get.mockImplementation(async ({ Key }) =>
      String(Key.pk).startsWith("BETTER_AUTH#")
        ? { Item: { id: "better-user-1", email: "member@example.test" } }
        : {},
    );
    const { ensureAppUserForEmail } = await import("@/lib/app-users");

    await ensureAppUserForEmail({
      email: "member@example.test",
      preferredUserId: "better-user-1",
      name: "Member",
    });

    const items = mocks.transactWrite.mock.calls[0][0].TransactItems;
    expect(items).toHaveLength(3);
    expect(items[0].Update.ExpressionAttributeValues).toMatchObject({
      ":appUserId": "better-user-1",
      ":betterAuthUserId": "better-user-1",
    });
    expect(items[2].Put.Item).toMatchObject({
      type: "USER",
      id: "better-user-1",
      email: "member@example.test",
    });
  });

  it("does not rewrite an already-complete claim on each session resolution", async () => {
    mocks.query.mockResolvedValueOnce({
      Items: [{ id: "app-user-1", email: "member@example.test", type: "USER" }],
    });
    mocks.get.mockResolvedValueOnce({
      Item: {
        pk: "EMAIL_OWNERSHIP#member@example.test",
        sk: "EMAIL_OWNERSHIP#member@example.test",
        type: "EMAIL_OWNERSHIP",
        email: "member@example.test",
        appUserId: "app-user-1",
        betterAuthUserId: "better-user-1",
      },
    });
    const { ensureAppUserForEmail } = await import("@/lib/app-users");

    await ensureAppUserForEmail({
      email: "member@example.test",
      preferredUserId: "better-user-1",
    });

    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.transactWrite).not.toHaveBeenCalled();
  });

  it("fails closed before writing when a normalized email has another app owner", async () => {
    mocks.get.mockImplementation(async ({ Key }) => {
      if (String(Key.pk).startsWith("BETTER_AUTH#")) {
        return { Item: { id: "better-user-1", email: "member@example.test" } };
      }
      return {
        Item: {
          type: "EMAIL_OWNERSHIP",
          email: "member@example.test",
          appUserId: "another-app-user",
        },
      };
    });
    const { ensureAppUserForEmail } = await import("@/lib/app-users");
    const { EmailOwnershipCollisionError } = await import("@/lib/email-ownership");

    await expect(
      ensureAppUserForEmail({
        email: "member@example.test",
        preferredUserId: "better-user-1",
      }),
    ).rejects.toBeInstanceOf(EmailOwnershipCollisionError);
    expect(mocks.transactWrite).not.toHaveBeenCalled();
  });
});
