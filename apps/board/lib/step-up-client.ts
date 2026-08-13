"use client";

import { betterAuthClient } from "@/lib/auth-client";

export async function verifyBoardPasskey(): Promise<void> {
  const result = await betterAuthClient.signIn.passkey();
  if (result.error) throw new Error("Passkey verification was not completed.");
}

export async function fetchWithBoardStepUp(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let response = await fetch(input, init);
  if (response.status !== 428) return response;
  await verifyBoardPasskey();
  response = await fetch(input, init);
  return response;
}
