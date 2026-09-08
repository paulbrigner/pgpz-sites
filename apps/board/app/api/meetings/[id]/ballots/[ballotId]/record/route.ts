import { NextRequest } from "next/server";
import { resolveBoardMemberState } from "@/lib/session";
import { requireBoardPasskeySession } from "@/lib/api-security";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { consentRecord, consentRecordHtml } from "@/lib/consent-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; ballotId: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return new Response(null, { status: 401, headers });
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  const { id, ballotId } = await context.params;
  const ballot = await boardMeetingsRepository.getAsyncBallot(id, ballotId);
  if (!ballot?.consent || ballot.status === "draft") return new Response(null, { status: 404, headers });
  const receipts = await boardMeetingsRepository.listConsentReceipts(id, ballotId);
  const record = consentRecord(ballot, receipts, state.member.email);
  if (request.nextUrl.searchParams.get("format") === "json") return Response.json(record, { headers });
  return new Response(consentRecordHtml(record), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'" } });
}
