import { describe, expect, it } from "vitest";
import { BoardMeetingVersionConflictError } from "./meetings";
import { createBoardMeetingsRepository } from "./meetings-repository";

type Row = Record<string, unknown>;

function fakeClient() {
  const items = new Map<string, Row>();
  const keyOf = (row: Row) => `${row.pk}#${row.sk}`;
  return {
    items,
    async get({ Key }: { Key: Row }) { return { Item: items.get(keyOf(Key)) }; },
    async query(input: { IndexName?: string; ExpressionAttributeValues: Row; ScanIndexForward?: boolean; Limit?: number }) {
      let rows = [...items.values()];
      if (input.IndexName === "Timeline") {
        const boundary = String(input.ExpressionAttributeValues[":boundary"]);
        const upcoming = input.ScanIndexForward === true;
        rows = rows.filter((row) => row.timelinePk === "MEETINGS" && (upcoming ? String(row.timelineSk) >= boundary : String(row.timelineSk) < boundary));
        rows.sort((a, b) => String(a.timelineSk).localeCompare(String(b.timelineSk)) * (upcoming ? 1 : -1));
      } else {
        rows = rows.filter((row) => row.pk === input.ExpressionAttributeValues[":pk"]);
        rows.sort((a, b) => String(a.sk).localeCompare(String(b.sk)));
      }
      return { Items: rows.slice(0, input.Limit || rows.length) };
    },
    async transactWrite({ TransactItems }: { TransactItems: Array<Record<string, { Item?: Row; Key?: Row; ConditionExpression?: string; ExpressionAttributeValues?: Row }>> }) {
      for (const entry of TransactItems) {
        const check = entry.ConditionCheck;
        if (check && !items.has(keyOf(check.Key || {}))) throw { name: "TransactionCanceledException" };
        const put = entry.Put;
        if (!put?.Item) continue;
        const key = keyOf(put.Item);
        const current = items.get(key);
        if (put.ConditionExpression?.includes("attribute_not_exists") && current && !(put.ConditionExpression.includes(" OR ") && current.status === "failed")) throw { name: "TransactionCanceledException" };
        if (put.ConditionExpression?.includes("#attemptId") && (current?.attemptId !== put.ExpressionAttributeValues?.[":attemptId"] || current?.status !== put.ExpressionAttributeValues?.[":pending"])) throw { name: "TransactionCanceledException" };
        const expected = put.ExpressionAttributeValues?.[":expectedVersion"];
        if (expected !== undefined && current?.version !== expected) throw { name: "TransactionCanceledException" };
      }
      for (const entry of TransactItems) if (entry.Put?.Item) items.set(keyOf(entry.Put.Item), entry.Put.Item);
    },
  };
}

function newMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: "meeting-1", title: "Quarterly Board Meeting", description: "", type: "regular" as const,
    startAt: "2026-09-10T14:00:00-04:00", endAt: "2026-09-10T16:00:00-04:00",
    timeZone: "America/New_York", location: "Online", virtualUrl: "https://meet.example.org/board",
    actorEmail: "chair@pgpz.org", occurredAt: "2026-08-13T12:00:00Z", ...overrides,
  };
}

describe("Board meetings repository", () => {
  it("normalizes instants and returns chronological upcoming and reverse chronological past pages", async () => {
    const client = fakeClient();
    const repo = createBoardMeetingsRepository(client as never, "Meetings");
    const first = await repo.createMeeting(newMeeting());
    await repo.createMeeting(newMeeting({ id: "meeting-2", startAt: "2026-08-01T10:00:00Z", endAt: "2026-08-01T11:00:00Z" }));
    expect(first.startAt).toBe("2026-09-10T18:00:00.000Z");
    await expect(repo.listMeetings({ scope: "upcoming", now: "2026-08-13T00:00:00-04:00" })).resolves.toMatchObject({ meetings: [{ id: "meeting-1" }] });
    await expect(repo.listMeetings({ scope: "past", now: "2026-08-13T00:00:00-04:00" })).resolves.toMatchObject({ meetings: [{ id: "meeting-2" }] });
  });

  it("validates time zones, secure meeting links, and lifecycle transitions", async () => {
    const repo = createBoardMeetingsRepository(fakeClient() as never, "Meetings");
    await expect(repo.createMeeting(newMeeting({ timeZone: "Moon/Base" }))).rejects.toThrow(/IANA/);
    await expect(repo.createMeeting(newMeeting({ virtualUrl: "http://example.org/meeting" }))).rejects.toThrow(/HTTPS/);
    const created = await repo.createMeeting(newMeeting());
    await expect(repo.changeStatus({ id: created.id, expectedVersion: 1, status: "completed", actorEmail: "chair@pgpz.org" })).rejects.toThrow(/invalid meeting status transition/);
    const scheduled = await repo.changeStatus({ id: created.id, expectedVersion: 1, status: "scheduled", actorEmail: "chair@pgpz.org" });
    expect(scheduled.version).toBe(2);
    await expect(repo.updateMeeting({ id: created.id, expectedVersion: 1, title: "Stale", actorEmail: "chair@pgpz.org" })).rejects.toBeInstanceOf(BoardMeetingVersionConflictError);
  });

  it("orders aggregate child records and prevents a decision from being overwritten", async () => {
    const client = fakeClient();
    const repo = createBoardMeetingsRepository(client as never, "Meetings");
    let meeting = await repo.createMeeting(newMeeting());
    meeting = await repo.upsertAgendaItem({ meetingId: meeting.id, expectedVersion: meeting.version, id: "later", order: 20, title: "Later", description: "", kind: "discussion", presenter: "ED", allottedMinutes: 10, status: "active", actorEmail: "chair@pgpz.org" });
    meeting = await repo.upsertAgendaItem({ meetingId: meeting.id, expectedVersion: meeting.version, id: "first", order: 10, title: "First", description: "", kind: "information", presenter: "Chair", allottedMinutes: 5, status: "active", actorEmail: "chair@pgpz.org" });
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "completed", actorEmail: "chair@pgpz.org" });
    const decision = { meetingId: meeting.id, expectedVersion: meeting.version, id: "decision-1", agendaItemId: "first", title: "Approve", motion: "Approve report", mover: "A", seconder: "B", yes: 3, no: 0, abstain: 0, recused: 0, outcome: "passed" as const, supersedesDecisionId: null, actorEmail: "chair@pgpz.org" };
    meeting = await repo.recordDecision(decision);
    expect((await repo.getMeeting(meeting.id))?.agendaItems.map((item) => item.id)).toEqual(["first", "later"]);
    await expect(repo.recordDecision({ ...decision, expectedVersion: meeting.version })).rejects.toBeInstanceOf(BoardMeetingVersionConflictError);
  });

  it("records immutable per-recipient delivery events without changing the meeting version", async () => {
    const client = fakeClient();
    const repo = createBoardMeetingsRepository(client as never, "Meetings");
    const meeting = await repo.createMeeting(newMeeting());
    const delivery = { meetingId: meeting.id, id: "event-1", communicationId: "campaign-1", attemptId: "attempt-1", kind: "reminder" as const, status: "pending" as const, recipientEmail: "DIRECTOR@PGPZ.ORG", idempotencyKey: "dedupe-1", failureReason: null, actorEmail: "chair@pgpz.org", occurredAt: "2026-08-13T13:00:00Z" };
    const recorded = await repo.recordDelivery(delivery);
    expect(recorded.recipientEmail).toBe("director@pgpz.org");
    expect((await repo.getMeeting(meeting.id))?.meeting.version).toBe(1);
    await expect(repo.recordDelivery(delivery)).rejects.toThrow(/already recorded/);
    await expect(repo.recordDelivery({ ...delivery, id: "event-2", status: "sent", occurredAt: "2026-08-13T13:00:01Z" })).resolves.toMatchObject({ status: "sent", attemptId: "attempt-1" });
  });

  it("retries only a confirmed failed delivery for the same recipient campaign", async () => {
    const repo = createBoardMeetingsRepository(fakeClient() as never, "Meetings");
    const meeting = await repo.createMeeting(newMeeting());
    const pending = { meetingId: meeting.id, id: "pending-1", communicationId: "campaign-1", attemptId: "attempt-1", kind: "reminder" as const, status: "pending" as const, recipientEmail: "director@pgpz.org", idempotencyKey: "dedupe-1", failureReason: null, actorEmail: "chair@pgpz.org", occurredAt: "2026-08-13T13:00:00Z" };
    await repo.recordDelivery(pending);
    await repo.recordDelivery({ ...pending, id: "failed-1", status: "failed", failureReason: "delivery_failed", occurredAt: "2026-08-13T13:00:01Z" });
    await expect(repo.recordDelivery({ ...pending, id: "pending-2", attemptId: "attempt-2", occurredAt: "2026-08-13T13:01:00Z" })).resolves.toMatchObject({ status: "pending", attemptId: "attempt-2" });
    await expect(repo.recordDelivery({ ...pending, id: "pending-3", attemptId: "attempt-3", occurredAt: "2026-08-13T13:02:00Z" })).rejects.toThrow(/already recorded/);
  });

  it("configures and confirms quorum as an audited aggregate mutation", async () => {
    const repo = createBoardMeetingsRepository(fakeClient() as never, "Meetings");
    let meeting = await repo.createMeeting(newMeeting({ quorumRequired: 3 }));
    expect(meeting.quorumRequired).toBe(3);
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
    meeting = await repo.confirmQuorum({ meetingId: meeting.id, expectedVersion: meeting.version, confirmed: true, actorEmail: "chair@pgpz.org", occurredAt: "2026-09-10T18:05:00Z" });
    expect(meeting).toMatchObject({ quorumConfirmedAt: "2026-09-10T18:05:00.000Z", quorumConfirmedBy: "chair@pgpz.org", version: 3 });
  });

  it("requires governed minutes documents and enforces approval progression", async () => {
    const repo = createBoardMeetingsRepository(fakeClient() as never, "Meetings");
    let meeting = await repo.createMeeting(newMeeting());
    await expect(repo.setMinutes({ meetingId: meeting.id, expectedVersion: 1, status: "approved", documentId: "minutes-1", actorEmail: "chair@pgpz.org" })).rejects.toThrow(/invalid minutes status transition/);
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "completed", actorEmail: "chair@pgpz.org" });
    const draft = await repo.setMinutes({ meetingId: meeting.id, expectedVersion: meeting.version, status: "draft", documentId: "minutes-1", actorEmail: "support@pgpz.org" });
    expect(draft.minutesDocumentId).toBe("minutes-1");
    await expect(repo.changeStatus({ id: meeting.id, expectedVersion: draft.version, status: "closed", actorEmail: "chair@pgpz.org" })).rejects.toThrow(/approved minutes/);
    const pending = await repo.setMinutes({ meetingId: meeting.id, expectedVersion: draft.version, status: "pending-approval", documentId: "minutes-1", actorEmail: "support@pgpz.org" });
    const approved = await repo.setMinutes({ meetingId: meeting.id, expectedVersion: pending.version, status: "approved", documentId: "minutes-1", actorEmail: "chair@pgpz.org" });
    await expect(repo.changeStatus({ id: meeting.id, expectedVersion: approved.version, status: "closed", actorEmail: "chair@pgpz.org" })).resolves.toMatchObject({ status: "closed" });
  });

  it("runs an asynchronous ballot with a fixed roster, changeable votes, and final aggregate result", async () => {
    const client = fakeClient();
    const repo = createBoardMeetingsRepository(client as never, "Meetings");
    let meeting = await repo.createMeeting(newMeeting({
      format: "asynchronous", startAt: "2026-09-10T13:00:00Z", endAt: "2026-09-12T21:00:00Z",
      location: "Ignored", virtualUrl: "https://meet.example.org/ignored",
    }));
    expect(meeting).toMatchObject({ format: "asynchronous", location: "", virtualUrl: null });
    meeting = await repo.upsertAsyncBallot({
      meetingId: meeting.id, expectedVersion: meeting.version, id: "ballot-1",
      title: "Approve the policy", motion: "Resolved, that the policy is approved.",
      actorEmail: "chair@pgpz.org", occurredAt: "2026-09-01T12:00:00Z",
    });
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
    const voters = [
      { userId: "director-1", name: "Ada", email: "ADA@example.org" },
      { userId: "director-2", name: "Grace", email: "grace@example.org" },
    ];
    meeting = await repo.openAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, ballotId: "ballot-1", eligibleVoters: voters, actorEmail: "chair@pgpz.org", occurredAt: "2026-09-02T12:00:00Z" });
    let detail = await repo.getMeeting(meeting.id);
    expect(detail?.asyncBallots[0]).toMatchObject({ status: "open", quorumRequired: 2, approvalRequired: 2 });

    await repo.castAsyncVote({ meetingId: meeting.id, ballotId: "ballot-1", choice: "yes", voter: { ...voters[0], email: "ada@example.org" }, occurredAt: "2026-09-10T14:00:00Z" });
    await expect(repo.closeAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, ballotId: "ballot-1", actorEmail: "chair@pgpz.org", occurredAt: "2026-09-10T15:00:00Z" })).rejects.toThrow(/after the voting deadline/);
    await repo.castAsyncVote({ meetingId: meeting.id, ballotId: "ballot-1", choice: "no", voter: voters[1], occurredAt: "2026-09-10T14:05:00Z" });
    await repo.castAsyncVote({ meetingId: meeting.id, ballotId: "ballot-1", choice: "yes", voter: voters[1], occurredAt: "2026-09-10T14:10:00Z" });
    meeting = await repo.closeAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, ballotId: "ballot-1", actorEmail: "chair@pgpz.org", occurredAt: "2026-09-12T21:00:00Z" });

    detail = await repo.getMeeting(meeting.id);
    expect(detail?.asyncVotes).toHaveLength(2);
    expect(detail?.asyncBallots[0]).toMatchObject({ status: "closed", result: { yes: 2, no: 0, ballotsCast: 2, quorumMet: true, outcome: "passed" } });
    expect(detail?.decisions[0]).toMatchObject({ id: "async-ballot-1", outcome: "passed", yes: 2 });
    expect([...client.items.values()].filter((item) => item.entityType === "ASYNC_VOTE_REVISION")).toHaveLength(3);
  });

  it("rejects asynchronous votes outside the retained voting window", async () => {
    const repo = createBoardMeetingsRepository(fakeClient() as never, "Meetings");
    let meeting = await repo.createMeeting(newMeeting({ format: "asynchronous", startAt: "2026-09-10T13:00:00Z", endAt: "2026-09-12T21:00:00Z" }));
    meeting = await repo.upsertAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, id: "ballot-1", title: "Vote", motion: "Resolved.", actorEmail: "chair@pgpz.org" });
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
    const voter = { userId: "director-1", name: "Ada", email: "ada@example.org" };
    await repo.openAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, ballotId: "ballot-1", eligibleVoters: [voter], actorEmail: "chair@pgpz.org", occurredAt: "2026-09-01T12:00:00Z" });
    await expect(repo.castAsyncVote({ meetingId: meeting.id, ballotId: "ballot-1", choice: "yes", voter, occurredAt: "2026-09-10T12:59:59Z" })).rejects.toThrow(/not opened/);
    await expect(repo.castAsyncVote({ meetingId: meeting.id, ballotId: "ballot-1", choice: "yes", voter, occurredAt: "2026-09-12T21:00:00Z" })).rejects.toThrow(/deadline/);
  });

  it("retains per-ballot discussion threads, replies, and short-window author edits", async () => {
    const client = fakeClient();
    const repo = createBoardMeetingsRepository(client as never, "Meetings");
    let meeting = await repo.createMeeting(newMeeting({
      format: "asynchronous", startAt: "2026-09-10T13:00:00Z", endAt: "2026-09-12T21:00:00Z",
    }));
    meeting = await repo.upsertAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, id: "ballot-1", title: "Vote", motion: "Resolved.", actorEmail: "chair@pgpz.org" });
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
    await repo.openAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, ballotId: "ballot-1", eligibleVoters: [{ userId: "director-1", name: "Ada", email: "ada@example.org" }], actorEmail: "chair@pgpz.org", occurredAt: "2026-09-01T12:00:00Z" });

    const root = await repo.createAsyncDiscussionMessage({
      meetingId: meeting.id, ballotId: "ballot-1", id: "message-1", body: "Should the effective date move?",
      authorUserId: "director-1", authorName: "Ada", authorEmail: "ADA@example.org", occurredAt: "2026-09-10T13:01:00Z",
    });
    await repo.createAsyncDiscussionMessage({
      meetingId: meeting.id, ballotId: "ballot-1", id: "message-2", replyToMessageId: root.id, body: "I support a later date.",
      authorUserId: "director-2", authorName: "Grace", authorEmail: "grace@example.org", occurredAt: "2026-09-10T13:02:00Z",
    });
    const edited = await repo.editAsyncDiscussionMessage({
      meetingId: meeting.id, ballotId: "ballot-1", messageId: root.id,
      body: "Should the effective date move to October?", expectedUpdatedAt: root.updatedAt,
      authorUserId: "director-1", occurredAt: "2026-09-10T13:10:00Z",
    });

    expect(edited).toMatchObject({ body: "Should the effective date move to October?", editedAt: "2026-09-10T13:10:00.000Z" });
    expect((await repo.getMeeting(meeting.id))?.asyncDiscussionMessages).toMatchObject([
      { id: "message-1", authorEmail: "ada@example.org", replyToMessageId: null },
      { id: "message-2", replyToMessageId: "message-1" },
    ]);
    expect([...client.items.values()].filter((item) => item.entityType === "ASYNC_DISCUSSION_REVISION")).toHaveLength(3);
    await expect(repo.editAsyncDiscussionMessage({
      meetingId: meeting.id, ballotId: "ballot-1", messageId: root.id, body: "Unauthorized edit",
      expectedUpdatedAt: edited.updatedAt, authorUserId: "director-2", occurredAt: "2026-09-10T13:11:00Z",
    })).rejects.toThrow(/only the author/);
    await expect(repo.editAsyncDiscussionMessage({
      meetingId: meeting.id, ballotId: "ballot-1", messageId: root.id, body: "Late edit",
      expectedUpdatedAt: edited.updatedAt, authorUserId: "director-1", occurredAt: "2026-09-10T13:16:01Z",
    })).rejects.toThrow(/15 minutes/);
    await expect(repo.createAsyncDiscussionMessage({
      meetingId: meeting.id, ballotId: "ballot-1", body: "Too late", authorUserId: "director-1",
      authorName: "Ada", authorEmail: "ada@example.org", occurredAt: "2026-09-12T21:00:00Z",
    })).rejects.toThrow(/closed/);
  });
});
