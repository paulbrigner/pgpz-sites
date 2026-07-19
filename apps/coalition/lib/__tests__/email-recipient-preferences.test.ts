import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  scan: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: {
    scan: dynamoMocks.scan,
  },
  TABLE_NAME: "TestTable",
}));

import { listPolicyUpdateRecipients } from "@/lib/admin/roster";

const activeMember = (id: string, preferences: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@example.test`,
  firstName: id,
  accountStatus: "active",
  membershipStatus: "active",
  ...preferences,
});

describe("email recipient category preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.scan.mockResolvedValue({
      Items: [
        activeMember("all-mail"),
        activeMember("no-newsletters", { emailNewsletterOptIn: false }),
        activeMember("no-policy", { emailPolicyUpdateOptIn: false }),
        activeMember("suppressed", { emailSuppressed: true }),
      ],
    });
  });

  it("filters newsletter and policy-update audiences independently", async () => {
    const newsletters = await listPolicyUpdateRecipients("newsletter");
    const policyUpdates = await listPolicyUpdateRecipients("policy_update");

    expect(newsletters.map((recipient) => recipient.id)).toEqual(["all-mail", "no-policy"]);
    expect(policyUpdates.map((recipient) => recipient.id)).toEqual(["all-mail", "no-newsletters"]);
  });
});
