import { describe, expect, it } from "vitest";
import { BoardMeetingVersionConflictError } from "./meetings";
import type { BoardAccessRecord } from "./board-access";
import { createBoardMeetingsRepository } from "./meetings-repository";
import { fakeClient, rosterFor, newMeeting, reviewFixture } from "./test-support/meeting-review-repository";
import { consentDigest, consentPayload } from "./written-consent-integrity";

type Row = Record<string, unknown>;

async function consentFixture(adoptDocument = true, description?: string) {
  const client = fakeClient(), repo = createBoardMeetingsRepository(client, "Meetings");
  let meeting = await repo.createMeeting(newMeeting({ format: "asynchronous", startAt: "2026-09-10T13:00:00Z", endAt: "2026-09-12T21:00:00Z" }));
  meeting = await repo.upsertAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, id: "ballot-1", title: "Adopt bylaws", motion: "Resolved, the attached bylaws are adopted.", adoption: { targets: adoptDocument ? [{ documentId: "bylaws", versionId: "v3" }] : [], effectiveTerms: "Upon adoption" }, attachments: [{ documentId: "bylaws", versionId: "v3", sequence: 3, title: "Bylaws", fileName: "bylaws.pdf", sha256: "a".repeat(64), ...(description ? { description } : {}) }], actorEmail: "chair@pgpz.org" });
  meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
  const voters = Array.from({ length: 5 }, (_, i) => ({ userId: `director-${i}`, name: `Director ${i}`, email: `director${i}@example.org` }));
  const roster = rosterFor(client, voters);
  meeting = await repo.openAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, ballotId: "ballot-1", eligibleVoters: voters, roster, rosterConfirmed: true, actorEmail: "chair@pgpz.org", occurredAt: "2026-09-09T12:00:00Z" });
  async function sign(i: number, action: "consent" | "withdraw" = "consent", overrides: Partial<Parameters<typeof repo.signAsyncConsent>[0]> = {}) {
    const detail = (await repo.getMeeting(meeting.id))!;
    return repo.signAsyncConsent({ meetingId: meeting.id, ballotId: "ballot-1", expectedVersion: detail.meeting.version, contentHash: detail.asyncBallots[0].consent!.contentHash, action, signatureName: voters[i].name, intent: true, accessRecord: client.items.get(`ACCESS#director-${i}#PROFILE`) as unknown as BoardAccessRecord, authenticatedUserId: `auth-${i}`, roster, occurredAt: "2026-09-10T14:00:00Z", ...overrides });
  }
  return { client, repo, roster, meeting, sign };
}

describe("required resolution reviews", () => {
  it("blocks opening until every director is ready, then binds the review record to schema 4 without adopting early", async () => {
    const f = await reviewFixture();
    await expect(f.open()).rejects.toThrow(/Start or restart review/);
    await f.start();
    for (let i = 0; i < 4; i++) await f.submit(i);
    await expect(f.open()).rejects.toThrow(/Every director must complete/);
    expect((await f.get()).asyncBallots[0].status).toBe("draft");
    await f.submit(4);
    await expect(f.open({ reviewRecordConfirmed: false })).rejects.toThrow(/Confirm that the review record/);
    await expect(f.open({ reviewFindings: "" })).rejects.toThrow(/Findings presented for adoption/);
    await f.open();
    const ballot = (await f.get()).asyncBallots[0];
    expect(ballot.consent?.schema).toBe(4);
    expect(ballot.consent?.receipts).toEqual([]);
    expect(ballot.status).toBe("open");
    expect(consentDigest(consentPayload(ballot, ballot.consent!))).toBe(ballot.consent!.contentHash);
    const changed = { ...ballot, review: { ...ballot.review!, round: { ...ballot.review!.round!, finalization: { ...ballot.review!.round!.finalization!, findings: "Altered after opening" } } } };
    expect(consentDigest(consentPayload(changed, ballot.consent!))).not.toBe(ballot.consent!.contentHash);
    await expect(f.submit(0)).rejects.toThrow(/Reviews cannot change/);
    for (let i = 0; i < 5; i++) {
      const current = await f.get();
      await f.repo.signAsyncConsent({ meetingId: f.meeting.id, expectedVersion: current.meeting.version, ballotId: f.draft.id, contentHash: ballot.consent!.contentHash, action: "consent", signatureName: f.voters[i].name, intent: true, accessRecord: f.access(i), authenticatedUserId: `auth-${i}`, roster: f.roster, occurredAt: "2026-09-10T20:10:00Z" });
    }
    expect((await f.get()).asyncBallots[0].status).toBe("closed");
    expect(await f.repo.listDocumentAdoptions("employment")).toHaveLength(1);
    const events = await f.repo.listResolutionReviewEvents(f.meeting.id, f.draft.id);
    expect(events.filter((event) => event.action === "review-submitted")).toHaveLength(5);
    expect(events.some((event) => event.action === "review-finalized")).toBe(true);
  });

  it("preserves corrections and prevents unresolved conflicts or follow-up requests from opening consent", async () => {
    const f = await reviewFixture(); await f.start();
    for (let i = 0; i < 5; i++) await f.submit(i);
    await f.submit(1, { conflict: "needs-attention" });
    await expect(f.open()).rejects.toThrow(/Every director must complete/);
    await f.submit(1, { outcome: "needs-attention" });
    await expect(f.open()).rejects.toThrow(/Every director must complete/);
    await f.submit(1); await f.open();
    expect((await f.repo.listResolutionReviewEvents(f.meeting.id, f.draft.id)).filter((event) => event.action === "review-submitted")).toHaveLength(8);
  });

  it("requires fresh review after material edits or roster changes and never drops the review requirement", async () => {
    const f = await reviewFixture(); await f.start(); await f.submit(0);
    const originalRound = (await f.get()).asyncBallots[0].review!.round!.id;
    await expect(f.repo.upsertAsyncBallot({ ...f.draft, expectedVersion: (await f.get()).meeting.version, review: null })).rejects.toThrow(/cannot be removed/);
    await expect(f.repo.upsertAsyncBallot({ ...f.draft, expectedVersion: (await f.get()).meeting.version, motion: "Changed terms" })).rejects.toThrow(/restarting every director/);
    await f.repo.upsertAsyncBallot({ ...f.draft, expectedVersion: (await f.get()).meeting.version, motion: "Changed terms", restartReview: true });
    expect((await f.get()).asyncBallots[0].review).toMatchObject({ everStarted: true, round: null });
    await expect(f.open()).rejects.toThrow(/Start or restart/);
    await f.start();
    expect((await f.get()).asyncBallots[0].review!.round!.id).not.toBe(originalRound);
    await expect(f.submit(0, { roundId: originalRound })).rejects.toThrow(/materials changed/);
    const changedRoster = { ...f.roster, revision: "roster-2" };
    await expect(f.submit(0, { roster: changedRoster })).rejects.toThrow(/roster changed/);
    await expect(f.open({ roster: changedRoster })).rejects.toThrow(/Start or restart/);
    expect((await f.repo.listResolutionReviewEvents(f.meeting.id, f.draft.id)).some((event) => event.action === "review-invalidated")).toBe(true);
  });

  it("checks actor, exact materials, dates, explicit attestation and optimistic concurrency", async () => {
    const f = await reviewFixture(); await f.start();
    await expect(f.submit(0, { accessRecord: { ...f.access(0), role: "executive-director" } })).rejects.toThrow(/active director/);
    await expect(f.submit(0, { accessRecord: { ...f.access(0), status: "deactivated" } })).rejects.toThrow(/active director/);
    await expect(f.submit(0, { accessRecord: { ...f.access(0), id: "someone-else" } })).rejects.toThrow(/not on/);
    await expect(f.submit(0, { contentHash: "forged" })).rejects.toThrow(/materials changed/);
    await expect(f.submit(0, { reviewedOn: "2099-01-01" })).rejects.toThrow(/future/);
    await expect(f.submit(0, { reviewedOn: "2026-02-30" })).rejects.toThrow(/actual completed review date/);
    await expect(f.submit(0, { attested: false })).rejects.toThrow(/attest/);
    await expect(f.submit(0, { assessment: "" })).rejects.toThrow(/assessment/);
    await expect(f.submit(0, { expectedVersion: 1 })).rejects.toBeInstanceOf(BoardMeetingVersionConflictError);
    const revoked = { ...f.access(0), version: 2 };
    await expect(f.submit(0, { accessRecord: revoked })).rejects.toBeInstanceOf(BoardMeetingVersionConflictError);
    expect((await f.get()).asyncBallots[0].review!.round!.submissions).toHaveLength(0);
  });
});

describe("Board meetings repository", () => {
  it("signs attachment descriptions and records adoption after all five schema 3 consents", async () => {
    const { repo, meeting, sign } = await consentFixture(true, "Clean version for approval");
    const opened = (await repo.getMeeting(meeting.id))!.asyncBallots[0];
    expect(opened.consent!.schema).toBe(3);
    expect(consentDigest(consentPayload(opened, opened.consent!))).toBe(opened.consent!.contentHash);
    for (let i = 0; i < 5; i++) await sign(i);
    const adopted = (await repo.getMeeting(meeting.id))!.asyncBallots[0];
    expect(adopted.status).toBe("closed");
    expect(adopted.attachments![0].description).toBe("Clean version for approval");
    expect(await repo.listDocumentAdoptions("bylaws")).toHaveLength(1);
  });

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

  it("requires five signed consents, retains withdrawals, and adopts atomically on the final signature", async () => {
    const { repo, client, roster, sign, meeting } = await consentFixture();
    for (let i = 0; i < 4; i++) await sign(i);
    expect((await repo.getMeeting(meeting.id))?.decisions).toHaveLength(0);
    expect(await repo.listDocumentAdoptions("bylaws")).toHaveLength(0);
    await sign(0, "withdraw");
    await sign(4);
    expect((await repo.getMeeting(meeting.id))?.asyncBallots[0].status).toBe("open");
    const result = await sign(0);
    expect(result.adopted).toBe(true);
    const detail = await repo.getMeeting(meeting.id);
    expect(detail?.asyncBallots[0]).toMatchObject({ status: "closed", approvalRequired: 5, result: { yes: 5, outcome: "passed" } });
    expect(detail?.decisions).toHaveLength(1);
    expect(await repo.listConsentReceipts(meeting.id, "ballot-1")).toHaveLength(7);
    expect(await repo.listDocumentAdoptions("bylaws")).toHaveLength(1);
    expect([...client.items.values()].filter((item) => item.entityType === "DOCUMENT_ADOPTION")).toHaveLength(1);
    await expect(sign(0, "withdraw")).rejects.toThrow(/completed actions cannot be withdrawn/);
    await expect(repo.cancelAsyncBallot({ meetingId: meeting.id, ballotId: "ballot-1", expectedVersion: detail!.meeting.version, reason: "Cannot undo adoption", actorEmail: "chair@pgpz.org" })).rejects.toThrow(/only a draft or open/);
    expect(client.items.get("DIRECTOR_ROSTER#STATE")?.revision).toBe(roster.revision);
  });

  it("preserves a legacy draft's identity and contents and requires a new resolution ID", async () => {
    const { repo, client, meeting } = await consentFixture();
    const key = `MEETING#${meeting.id}#BALLOT#ballot-1`;
    const legacy: Row = { ...client.items.get(key), status: "draft" };
    delete legacy.consentMode; delete legacy.consent; delete legacy.attachments;
    client.items.set(key, legacy);
    const input = { meetingId: meeting.id, expectedVersion: meeting.version, id: "ballot-1", title: "Replacement", motion: "Replacement", actorEmail: "chair@pgpz.org" };
    await expect(repo.upsertAsyncBallot(input)).rejects.toThrow(/Legacy ballots are historical/);
    expect(client.items.get(key)).toEqual(legacy);
    await repo.upsertAsyncBallot({ ...input, id: "fresh-consent" });
    expect((await repo.getAsyncBallot(meeting.id, "fresh-consent"))?.consentMode).toBe("unanimous-v1");
    expect((await repo.getAsyncBallot(meeting.id, "ballot-1"))?.consentMode).toBeUndefined();
  });

  it("does not adopt supporting documents or infer targets for schema 1 consents", async () => {
    const support = await consentFixture(false);
    for (let i = 0; i < 5; i++) await support.sign(i);
    expect(await support.repo.listDocumentAdoptions("bylaws")).toEqual([]);
    const old = await consentFixture();
    const ballot = (await old.repo.getAsyncBallot(old.meeting.id, "ballot-1"))!;
    ballot.consent!.schema = 1;
    ballot.consent!.contentHash = consentDigest(consentPayload(ballot, ballot.consent!));
    const key = `MEETING#${old.meeting.id}#BALLOT#ballot-1`;
    old.client.items.set(key, { ...old.client.items.get(key), ...ballot });
    for (let i = 0; i < 5; i++) await old.sign(i);
    expect(await old.repo.listDocumentAdoptions("bylaws")).toEqual([]);
  });

  it("rejects locator-only or altered adoption evidence and never writes an index before adoption", async () => {
    const { repo, client, sign, meeting } = await consentFixture();
    client.items.set("forged", { pk: "DOCUMENT_ADOPTIONS#bylaws", sk: "ADOPTION#forged", entityType: "DOCUMENT_ADOPTION", documentId: "bylaws", versionId: "v3", meetingId: meeting.id, ballotId: "ballot-1" });
    expect(await repo.listDocumentAdoptions("bylaws")).toEqual([]);
    client.items.delete("forged");
    for (let i = 0; i < 5; i++) await sign(i);
    const key = `MEETING#${meeting.id}#BALLOT#ballot-1`;
    client.items.set(key, { ...client.items.get(key), motion: "Altered resolution" });
    expect(await repo.listDocumentAdoptions("bylaws")).toEqual([]);
  });

  it("rejects stale signatures and competing final-signature or withdrawal transactions", async () => {
    const { repo, sign, meeting } = await consentFixture();
    for (let i = 0; i < 4; i++) await sign(i);
    const version = (await repo.getMeeting(meeting.id))!.meeting.version;
    const results = await Promise.allSettled([sign(4, "consent", { expectedVersion: version }), sign(0, "withdraw", { expectedVersion: version })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const detail = (await repo.getMeeting(meeting.id))!;
    const current = detail.asyncBallots[0].consent!.receipts.filter((receipt) => receipt.action === "consent");
    expect(detail.decisions.length).toBe(current.length === 5 ? 1 : 0);
  });

  it("does not substitute ordinary votes, lower thresholds, mismatched text, or non-directors for signatures", async () => {
    const { repo, sign, meeting, roster, client } = await consentFixture();
    await expect(sign(0, "consent", { intent: false })).rejects.toThrow(/intent/);
    await expect(sign(0, "consent", { contentHash: "different" })).rejects.toThrow(/resolution changed/);
    const accessRecord = client.items.get("ACCESS#director-0#PROFILE") as unknown as BoardAccessRecord;
    await expect(sign(0, "consent", { accessRecord: { ...accessRecord, role: "executive-director" } })).rejects.toThrow(/currently active director/);
    await expect(sign(0, "consent", { accessRecord: { ...accessRecord, id: "outsider" } })).rejects.toThrow(/retained roster/);
    await expect(repo.castAsyncVote({ meetingId: meeting.id, ballotId: "ballot-1", choice: "yes", voter: roster.directors[0] })).rejects.toThrow(/retired/);
    await expect(repo.closeAsyncBallot({ meetingId: meeting.id, ballotId: "ballot-1", expectedVersion: meeting.version, actorEmail: "chair@pgpz.org" })).rejects.toThrow(/automatically/);
    await expect(repo.upsertAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, id: "lowered", title: "Bad", motion: "Bad", quorumRequired: 1, approvalRequired: 1, actorEmail: "chair@pgpz.org" })).rejects.toThrow(/custom thresholds/);
    await expect(repo.updateMeeting({ id: meeting.id, expectedVersion: meeting.version, format: "live", actorEmail: "chair@pgpz.org" })).rejects.toThrow(/fixed/);
    await expect(repo.upsertAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, id: "ballot-1", title: "Changed", motion: "Changed", actorEmail: "chair@pgpz.org" })).rejects.toThrow(/cannot be edited/);
  });

  it("pauses signatures when a director is added or removed but permits withdrawal", async () => {
    const { sign, roster, client } = await consentFixture();
    await sign(0);
    client.items.set("DIRECTOR_ROSTER#STATE", { ...roster, revision: "new-roster" });
    await expect(sign(1)).rejects.toThrow(/updated by another/);
    await expect(sign(1, "consent", { roster: { ...roster, revision: "new-roster" } })).rejects.toThrow(/roster changed/);
    await expect(sign(0, "withdraw")).resolves.toMatchObject({ adopted: false, receipt: { action: "withdraw" } });
  });

  it("enforces the collection window, permits late withdrawal before completion, and never finalizes a majority", async () => {
    const { repo, sign, meeting } = await consentFixture();
    await expect(sign(0, "consent", { occurredAt: "2026-09-10T12:59:59Z" })).rejects.toThrow(/window is closed/);
    await sign(0);
    await expect(sign(1, "consent", { occurredAt: "2026-09-12T21:00:00Z" })).rejects.toThrow(/window is closed/);
    await expect(sign(0, "withdraw", { occurredAt: "2026-09-13T00:00:00Z" })).resolves.toMatchObject({ adopted: false });
    let current = (await repo.getMeeting(meeting.id))!.meeting;
    await expect(repo.changeStatus({ id: meeting.id, expectedVersion: current.version, status: "completed", actorEmail: "chair@pgpz.org" })).rejects.toThrow(/outstanding resolution/);
    current = await repo.cancelAsyncBallot({ meetingId: meeting.id, ballotId: "ballot-1", expectedVersion: current.version, reason: "No unanimous consent", actorEmail: "chair@pgpz.org" });
    current = await repo.changeStatus({ id: meeting.id, expectedVersion: current.version, status: "completed", actorEmail: "chair@pgpz.org" });
    await expect(repo.recordDecision({ meetingId: meeting.id, expectedVersion: current.version, id: "bypass", agendaItemId: null, title: "Majority", motion: "Approve", mover: null, seconder: null, yes: 4, no: 0, abstain: 1, recused: 0, outcome: "passed", supersedesDecisionId: null, actorEmail: "chair@pgpz.org" })).rejects.toThrow(/automatically/);
    expect((await repo.getMeeting(meeting.id))?.decisions).toHaveLength(0);
  });

  it("retains per-ballot discussion threads, replies, and short-window author edits", async () => {
    const client = fakeClient();
    const repo = createBoardMeetingsRepository(client as never, "Meetings");
    let meeting = await repo.createMeeting(newMeeting({
      format: "asynchronous", startAt: "2026-09-10T13:00:00Z", endAt: "2026-09-12T21:00:00Z",
    }));
    meeting = await repo.upsertAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, id: "ballot-1", title: "Vote", motion: "Resolved.", actorEmail: "chair@pgpz.org" });
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
    await repo.openAsyncBallot({ meetingId: meeting.id, expectedVersion: meeting.version, ballotId: "ballot-1", eligibleVoters: [{ userId: "director-1", name: "Ada", email: "ada@example.org" }], roster: rosterFor(client, [{ userId: "director-1", name: "Ada", email: "ada@example.org" }]), rosterConfirmed: true, actorEmail: "chair@pgpz.org", occurredAt: "2026-09-01T12:00:00Z" });

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
