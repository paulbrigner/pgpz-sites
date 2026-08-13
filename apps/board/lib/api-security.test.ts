import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardMember } from "@/lib/session";

const securityMocks = vi.hoisted(() => ({
  hasBoardPasskey: vi.fn(),
  hasBoardPasskeySession: vi.fn(),
  hasRecentBoardPasskeyVerification: vi.fn(),
}));

vi.mock("@/lib/passkey-enrollment", () => ({
  hasBoardPasskey: securityMocks.hasBoardPasskey,
}));

vi.mock("@/lib/passkey-step-up", () => ({
  hasBoardPasskeySession: securityMocks.hasBoardPasskeySession,
  hasRecentBoardPasskeyVerification: securityMocks.hasRecentBoardPasskeyVerification,
}));

import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";

const member: BoardMember = {
  id: "user-1",
  name: "Board Member",
  email: "member@example.org",
  role: "member",
  isAdmin: false,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Board API passkey enforcement", () => {
  it("fails closed when no enrolled passkey can be confirmed", async () => {
    securityMocks.hasBoardPasskey.mockResolvedValue(false);
    const response = await requireBoardPasskeySession(new Headers(), member);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({ code: "PASSKEY_ENROLLMENT_REQUIRED" });
    expect(securityMocks.hasBoardPasskeySession).not.toHaveBeenCalled();
  });

  it("requires the current session to have completed passkey authentication", async () => {
    securityMocks.hasBoardPasskey.mockResolvedValue(true);
    securityMocks.hasBoardPasskeySession.mockResolvedValue(false);
    const response = await requireBoardPasskeySession(new Headers(), member);
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toMatchObject({ code: "PASSKEY_AUTHENTICATION_REQUIRED" });
  });

  it("accepts a passkey-authenticated session and separately enforces recent step-up", async () => {
    securityMocks.hasBoardPasskey.mockResolvedValue(true);
    securityMocks.hasBoardPasskeySession.mockResolvedValue(true);
    await expect(requireBoardPasskeySession(new Headers(), member)).resolves.toBeNull();

    securityMocks.hasRecentBoardPasskeyVerification.mockResolvedValue(false);
    const response = await requireBoardStepUp(new Headers(), member);
    expect(response?.status).toBe(428);
    await expect(response?.json()).resolves.toMatchObject({ code: "PASSKEY_STEP_UP_REQUIRED" });
  });
});
