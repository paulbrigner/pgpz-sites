import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

import {
  BOARD_PASSKEY_SESSION_MAX_AGE_SECONDS,
  BOARD_STEP_UP_MAX_AGE_SECONDS,
  createBoardStepUpToken,
  verifyBoardStepUpToken,
} from "@/lib/passkey-step-up";

describe("Board passkey assurance tokens", () => {
  const verifiedAt = Date.parse("2026-08-13T16:00:00Z");
  const token = createBoardStepUpToken({ userId: "user-1", sessionId: "session-1", verifiedAt });

  it("binds assurance to the exact user and session", () => {
    expect(verifyBoardStepUpToken(token, { userId: "user-1", sessionId: "session-1", now: verifiedAt + 1_000 })).toBe(true);
    expect(verifyBoardStepUpToken(token, { userId: "user-2", sessionId: "session-1", now: verifiedAt + 1_000 })).toBe(false);
    expect(verifyBoardStepUpToken(token, { userId: "user-1", sessionId: "session-2", now: verifiedAt + 1_000 })).toBe(false);
  });

  it("uses a short mutation step-up and a bounded passkey-authenticated session", () => {
    expect(verifyBoardStepUpToken(token, {
      userId: "user-1", sessionId: "session-1", now: verifiedAt + (BOARD_STEP_UP_MAX_AGE_SECONDS + 1) * 1_000,
    })).toBe(false);
    expect(verifyBoardStepUpToken(token, {
      userId: "user-1", sessionId: "session-1", now: verifiedAt + (BOARD_STEP_UP_MAX_AGE_SECONDS + 1) * 1_000,
      maxAgeSeconds: BOARD_PASSKEY_SESSION_MAX_AGE_SECONDS,
    })).toBe(true);
  });

  it("rejects tampering", () => {
    expect(verifyBoardStepUpToken(`${token}x`, { userId: "user-1", sessionId: "session-1", now: verifiedAt })).toBe(false);
  });
});
