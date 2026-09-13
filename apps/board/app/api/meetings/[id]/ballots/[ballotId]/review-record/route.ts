import { NextRequest } from "next/server";
import { resolveBoardMemberState } from "@/lib/session";
import { requireBoardPasskeySession } from "@/lib/api-security";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { isVotingDirector } from "@/lib/director-roster";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { resolutionReviewRecord, resolutionReviewRecordHtml, resolutionReviewPacket } from "@/lib/resolution-review-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; ballotId: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return new Response(null, { status: 401, headers });
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  const access = await boardAccessRepository.getByEmail(state.member.email);
  if (!access || access.status !== "active" || !isVotingDirector(access.role)) return new Response(null, { status: 404, headers });
  const { id, ballotId } = await context.params;
  const ballot = await boardMeetingsRepository.getAsyncBallot(id, ballotId);
  if (!ballot?.review || (!ballot.review.round && !ballot.review.everStarted)) return new Response(null, { status: 404, headers });
  const history = await boardMeetingsRepository.listResolutionReviewEvents(id, ballotId);
  try {
    const record = resolutionReviewRecord(ballot, history), format = request.nextUrl.searchParams.get("format");
    if (format === "json") return Response.json(record, { headers });
    if (format === "pdf") {
      const packet = await resolutionReviewPacket(record);
      return new Response(Buffer.from(packet.bytes), { headers: { ...headers, "Content-Type": packet.mimeType, "Content-Disposition": `attachment; filename="${packet.fileName}"` } });
    }
    return new Response(resolutionReviewRecordHtml(record), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'" } });
  } catch {
    return Response.json({ error: "The review record could not be verified or exported. Contact the Chair or use the retained review history." }, { status: 409, headers });
  }
}
