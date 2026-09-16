import { NextRequest, NextResponse } from "next/server";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { resolveBoardMemberState } from "@/lib/session";
import { agendaIdeasService } from "@/lib/agenda-ideas-service";
import { IdeaError } from "@/lib/agenda-ideas";
import { SITE_URL } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: NextRequest) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return json({ error: "Active Board access is required." }, 401);
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(SITE_URL).origin && origin !== request.nextUrl.origin) return json({ error: "Invalid request origin." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 65536) return json({ error: "Request too large." }, 413);
  try {
    const raw = await request.text();
    if (raw.length > 65536) return json({ error: "Request too large." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid request." }, 400); }
    if (!body || Array.isArray(body) || typeof body !== "object") return json({ error: "Invalid request." }, 400);
    if (body.action !== "read") {
      const stepUp = await requireBoardStepUp(request.headers, state.member);
      if (stepUp) return stepUp;
    }
    return json(await agendaIdeasService.execute(state.member, body));
  } catch (error) {
    if (error instanceof IdeaError) return json({ error: error.message }, error.status);
    if ((error as Error).name === "BoardMeetingVersionConflictError") return json({ error: "The meeting changed. Refresh and try again." }, 409);
    return json({ error: "The change could not be saved. Refresh and try again." }, 503);
  }
}
