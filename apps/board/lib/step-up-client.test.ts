import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ passkey: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ betterAuthClient: { signIn: { passkey: mocks.passkey } } }));
import { BOARD_PASSKEY_VERIFICATION_ERROR, fetchWithBoardStepUp, verifyBoardPasskey } from "./step-up-client";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("Board passkey verification", () => {
  it("explains incomplete verification and thrown browser failures", async () => {
    mocks.passkey.mockResolvedValue({ error: { code: "AUTH_CANCELLED" } });
    await expect(verifyBoardPasskey()).rejects.toThrow(BOARD_PASSKEY_VERIFICATION_ERROR);
    mocks.passkey.mockRejectedValue(new Error("Internal browser error"));
    await expect(verifyBoardPasskey()).rejects.toThrow(BOARD_PASSKEY_VERIFICATION_ERROR);
  });
  it("does not retry a protected write after failed verification", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 428 })); vi.stubGlobal("fetch", fetch);
    mocks.passkey.mockResolvedValue({ error: { code: "AUTH_CANCELLED" } });
    await expect(fetchWithBoardStepUp("/api/meetings", { method: "POST" })).rejects.toThrow(BOARD_PASSKEY_VERIFICATION_ERROR);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retries the protected write after successful verification", async () => {
    const success = new Response("{}");
    const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 428 })).mockResolvedValueOnce(success); vi.stubGlobal("fetch", fetch);
    mocks.passkey.mockResolvedValue({ error: null, data: {} });
    expect(await fetchWithBoardStepUp("/api/meetings", { method: "POST" })).toBe(success);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
