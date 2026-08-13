import { passkey } from "@better-auth/passkey";

export const BOARD_PASSKEY_MODEL_NAME = "better_auth_passkeys";

export function resolveBoardPasskeyIdentity(baseUrl: string) {
  const origin = new URL(baseUrl).origin;
  return { rpID: new URL(origin).hostname, origin };
}

export function createBoardPasskeyPlugin(baseUrl: string) {
  const identity = resolveBoardPasskeyIdentity(baseUrl);
  return passkey({
    ...identity,
    rpName: "PGPZ Board",
    authenticatorSelection: { userVerification: "required" },
    registration: { requireSession: true },
    schema: { passkey: { modelName: BOARD_PASSKEY_MODEL_NAME } },
  });
}
