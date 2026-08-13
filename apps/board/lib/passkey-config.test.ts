import { describe, expect, it } from "vitest";
import { BOARD_PASSKEY_MODEL_NAME, createBoardPasskeyPlugin, resolveBoardPasskeyIdentity } from "@/lib/passkey-config";

describe("Board passkey configuration", () => {
  it("scopes credentials to the exact Board host", () => {
    expect(resolveBoardPasskeyIdentity("https://board.pgpz.org/path")).toEqual({
      rpID: "board.pgpz.org",
      origin: "https://board.pgpz.org",
    });
  });

  it("matches the DynamoDB adapter model and requires verified, session-bound enrollment", () => {
    const plugin = createBoardPasskeyPlugin("https://board.pgpz.org");
    expect(plugin.options?.schema?.passkey?.modelName).toBe(BOARD_PASSKEY_MODEL_NAME);
    expect(plugin.options?.authenticatorSelection?.userVerification).toBe("required");
    expect(plugin.options?.registration?.requireSession).toBe(true);
  });
});
