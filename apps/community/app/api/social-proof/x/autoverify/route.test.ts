import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  autoVerifyPendingXProofs: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  SOCIAL_PROOF_AUTOVERIFY_SECRET:
    "current-autoverify-secret-at-least-32-characters",
  SOCIAL_PROOF_AUTOVERIFY_SECRET_PREVIOUS:
    "previous-autoverify-secret-at-least-32-characters",
}));
vi.mock("@/lib/social-proof", () => ({
  autoVerifyPendingXProofs: mocks.autoVerifyPendingXProofs,
}));

const request = (secret: string) =>
  new Request("https://community.pgpz.org/api/social-proof/x/autoverify", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ batchSize: 5 }),
  });

describe("POST /api/social-proof/x/autoverify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.autoVerifyPendingXProofs.mockResolvedValue({ processed: 1 });
  });

  it.each([
    "current-autoverify-secret-at-least-32-characters",
    "previous-autoverify-secret-at-least-32-characters",
  ])("accepts an authorized rotation-window key", async (secret) => {
    const { POST } = await import("./route");
    const response = await POST(request(secret) as never);

    expect(response.status).toBe(200);
    expect(mocks.autoVerifyPendingXProofs).toHaveBeenCalledWith({
      batchSize: 5,
      groupSize: undefined,
    });
  });

  it("rejects any key outside the current/previous pair", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("attacker-secret") as never);

    expect(response.status).toBe(401);
    expect(mocks.autoVerifyPendingXProofs).not.toHaveBeenCalled();
  });
});
