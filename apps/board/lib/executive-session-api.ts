import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { resolveBoardMemberState, type BoardMember } from "@/lib/session";
import { ExecutiveSessionError } from "@/lib/executive-sessions";
import { SITE_URL } from "@/lib/config";

export const executiveJson = (value: unknown, status = 200) => NextResponse.json(value, {
  status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" },
});

export async function executiveApi(request: NextRequest, mutate: boolean, handler: (member: BoardMember) => Promise<Response>): Promise<Response> {
  try {
    const state = await resolveBoardMemberState(request.headers);
    if (state.status !== "member") return executiveJson({ error: "Authentication required." }, 401);
    const assurance = await requireBoardPasskeySession(request.headers, state.member);
    if (assurance) return assurance;
    if (mutate) {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(SITE_URL).origin) return executiveJson({ error: "Invalid request origin." }, 403);
      const stepUp = await requireBoardStepUp(request.headers, state.member);
      if (stepUp) return stepUp;
    }
    return await handler(state.member);
  } catch (error) {
    if (error instanceof ExecutiveSessionError) return executiveJson({ error: error.message }, error.status);
    // Provider errors can embed request values. Do not log private records or input.
    console.error("[board] executive-session operation failed");
    return executiveJson({ error: "Unable to complete the restricted-session request." }, 500);
  }
}

/** Bound reads even when the sender omits or lies about Content-Length. */
export async function executiveBody(request: NextRequest, maximum = 64 * 1024): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new ExecutiveSessionError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new ExecutiveSessionError(413, "The request is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function executiveJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ExecutiveSessionError(400, "JSON is required.");
  const bytes = await executiveBody(request);
  try {
    const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch { throw new ExecutiveSessionError(400, "Invalid request."); }
}

export function requireExecutiveVersion(value: unknown, actual: number) {
  if (!Number.isInteger(value) || value !== actual) throw new ExecutiveSessionError(409, "The session changed. Refresh before trying again.");
}
