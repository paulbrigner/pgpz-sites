"use client";

import { betterAuthClient } from "@/lib/auth-client";

export const BOARD_PASSKEY_VERIFICATION_ERROR = "Passkey verification did not complete. Try again and complete the PIN, fingerprint, or face verification requested by your device or passkey provider. If you cannot complete it, contact a Board administrator for help.";

export async function verifyBoardPasskey(): Promise<void> {
  try {
    const result = await betterAuthClient.signIn.passkey();
    if (result.error) throw new Error(BOARD_PASSKEY_VERIFICATION_ERROR);
  } catch {
    throw new Error(BOARD_PASSKEY_VERIFICATION_ERROR);
  }
}

export async function fetchWithBoardStepUp(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let response = await fetch(input, init);
  if (response.status !== 428) return response;
  await verifyBoardPasskey();
  response = await fetch(input, init);
  return response;
}
