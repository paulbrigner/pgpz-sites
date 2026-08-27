import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { canManageBoardMeetings, resolveBoardMemberState } from "@/lib/session";
import { BOARD_ASYNC_VOTE_CHOICES, type BoardAsyncVoteChoice } from "@/lib/meetings";
import { boardMeetingsRepository } from "@/lib/meetings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("Voting requirements must be positive whole numbers.");
  return parsed;
}

async function auditItems(input: {
  member: Parameters<typeof authenticatedActor>[0];
  action: string;
  meetingId: string;
  ballotId: string;
  meetingVersion: number;
}) {
  return (await boardAuditLedger.buildAppendItems({
    category: "meeting",
    action: input.action,
    outcome: "success",
    actor: authenticatedActor(input.member),
    target: { type: "meeting-ballot", id: input.ballotId, version: String(input.meetingVersion) },
    metadata: new Map([["meetingId", input.meetingId]]),
    idempotencyKey: randomUUID(),
    occurredAt: new Date().toISOString(),
  })).TransactItems as Record<string, unknown>[];
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  const verification = await requireBoardStepUp(request.headers, state.member);
  if (verification) return verification;

  const { id: meetingId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action);
  const ballotId = text(body?.ballotId) || randomUUID();
  const expectedVersion = Number(body?.expectedVersion);
  const managerAction = action !== "castVote";
  if (managerAction && !canManageBoardMeetings(state.member)) {
    return NextResponse.json({ error: "Only the Board Chair or Executive Director may manage an official ballot." }, { status: 403 });
  }

  try {
    if (action === "saveBallot") {
      const audit = await auditItems({ member: state.member, action: "async_ballot_saved", meetingId, ballotId, meetingVersion: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.upsertAsyncBallot({
        meetingId, expectedVersion, id: ballotId,
        agendaItemId: text(body?.agendaItemId) || null,
        title: text(body?.title), motion: text(body?.motion),
        quorumRequired: positiveInteger(body?.quorumRequired),
        approvalRequired: positiveInteger(body?.approvalRequired),
        actorEmail: state.member.email,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting, ballotId });
    }

    if (action === "openBallot") {
      const roster = await boardAccessRepository.list({ status: "active", limit: 250 });
      const eligibleVoters = roster.records
        .filter((record) => record.role === "member" || record.role === "chair" || record.role === "admin")
        .map((record) => ({ userId: record.id, name: record.name, email: record.email }));
      const audit = await auditItems({ member: state.member, action: "async_ballot_opened", meetingId, ballotId, meetingVersion: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.openAsyncBallot({
        meetingId, expectedVersion, ballotId, eligibleVoters, actorEmail: state.member.email,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "castVote") {
      const choice = text(body?.choice) as BoardAsyncVoteChoice;
      if (!BOARD_ASYNC_VOTE_CHOICES.includes(choice)) {
        return NextResponse.json({ error: "Select yes, no, abstain, or recused." }, { status: 400 });
      }
      const detail = await boardMeetingsRepository.getMeeting(meetingId);
      const ballot = detail?.asyncBallots.find((candidate) => candidate.id === ballotId);
      const voter = ballot?.eligibleVoters.find((candidate) => candidate.email === state.member.email);
      if (!voter) return NextResponse.json({ error: "You are not eligible for this ballot." }, { status: 403 });
      const audit = await auditItems({ member: state.member, action: "async_vote_cast", meetingId, ballotId, meetingVersion: detail?.meeting.version || 0 });
      const vote = await boardMeetingsRepository.castAsyncVote({
        meetingId, ballotId, choice, voter, occurredAt: new Date().toISOString(),
      }, { additionalTransactItems: audit });
      return NextResponse.json({ vote: { choice: vote.choice, updatedAt: vote.updatedAt } });
    }

    if (action === "finalizeBallot") {
      const audit = await auditItems({ member: state.member, action: "async_ballot_finalized", meetingId, ballotId, meetingVersion: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.closeAsyncBallot({
        meetingId, expectedVersion, ballotId, actorEmail: state.member.email,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "cancelBallot") {
      const audit = await auditItems({ member: state.member, action: "async_ballot_cancelled", meetingId, ballotId, meetingVersion: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.cancelAsyncBallot({
        meetingId, expectedVersion, ballotId, reason: text(body?.reason), actorEmail: state.member.email,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    return NextResponse.json({ error: "Select a valid ballot action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The ballot action could not be completed.";
    const conflict = /updated by another|changed or the voting window|Conditional|Transaction/i.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }
}
