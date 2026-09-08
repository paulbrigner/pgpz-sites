import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { resolveBoardMemberState, type BoardMember } from "./session";
import { requireBoardPasskeySession, requireBoardStepUp } from "./api-security";
import { SITE_URL } from "./config";
import { DisclosureError } from "./disclosures";

export const disclosureJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function disclosureApi(request: NextRequest, mutate: boolean, handler: (member: BoardMember) => Promise<Response>) {
  try {
    const state = await resolveBoardMemberState(request.headers);
    if (state.status !== "member") return disclosureJson({ error: "Authentication required." }, 401);
    const assurance = await requireBoardPasskeySession(request.headers, state.member);
    if (assurance) return assurance;
    if (mutate) {
      if (request.headers.get("origin") && request.headers.get("origin") !== new URL(SITE_URL).origin) return disclosureJson({ error: "Invalid request origin." }, 403);
      const stepUp = await requireBoardStepUp(request.headers, state.member);
      if (stepUp) return stepUp;
    }
    return await handler(state.member);
  } catch (error) {
    if (error instanceof DisclosureError) return disclosureJson({ error: error.message }, error.status);
    console.error("[board] disclosure operation failed"); // Never log provider errors containing private input.
    return disclosureJson({ error: "Unable to complete this disclosure request." }, 500);
  }
}
export async function disclosureBody(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new DisclosureError(400, "JSON is required.");
  const reader = request.body?.getReader();
  if (!reader) throw new DisclosureError(400, "A request body is required.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 64 * 1024) { await reader.cancel(); throw new DisclosureError(413, "The request is too large."); }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new DisclosureError(400, "Invalid request body."); }
}
