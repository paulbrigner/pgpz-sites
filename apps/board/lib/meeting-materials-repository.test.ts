import { describe, expect, it } from "vitest";
import { createBoardMeetingsRepository } from "./meetings-repository";
import { fakeClient, newMeeting, reviewFixture } from "./test-support/meeting-review-repository";
import { BoardMeetingVersionConflictError } from "./meetings";

const document = { documentId: "library-doc", versionId: "v2", title: "Source evidence", description: "Reviewed sources", sequence: 2, fileName: "sources.pdf", sha256: "a".repeat(64) };
describe("retained meeting library references", () => {
  it("pins source metadata, retains removal history and atomically includes the audit append", async () => {
    const client = fakeClient(), repo = createBoardMeetingsRepository(client, "Meetings");
    let meeting = await repo.createMeeting(newMeeting());
    expect((await repo.getMeeting(meeting.id))!.materialReferences).toEqual([]);
    meeting = await repo.addMaterialReference({ meetingId: meeting.id, expectedVersion: meeting.version, actorEmail: "chair@example.invalid", document }, { additionalTransactItems: [{ Put: { TableName: "Audit", Item: { pk: "AUDIT", sk: "ADDED" } } }] });
    const reference = (await repo.getMeeting(meeting.id))!.materialReferences[0];
    expect(reference).toMatchObject({ ...document, status: "active", updatedBy: "chair@example.invalid" });
    expect(client.items.has("AUDIT#ADDED")).toBe(true);
    await expect(repo.addMaterialReference({ meetingId: meeting.id, expectedVersion: meeting.version, actorEmail: "chair@example.invalid", document })).rejects.toThrow(/already in Preparation/);
    await expect(repo.removeMaterialReference({ meetingId: meeting.id, expectedVersion: 1, referenceId: reference.id, actorEmail: "chair@example.invalid" })).rejects.toBeInstanceOf(BoardMeetingVersionConflictError);
    await repo.removeMaterialReference({ meetingId: meeting.id, expectedVersion: meeting.version, referenceId: reference.id, actorEmail: "chair@example.invalid" });
    expect((await repo.getMeeting(meeting.id))!.materialReferences[0]).toMatchObject({ ...document, status: "removed" });
    const revisions = [...client.items.values()].filter((row) => row.entityType === "MEETING_REVISION");
    expect(revisions.map((row) => row.action)).toContain("material-reference-added");
    expect(revisions.map((row) => row.action)).toContain("material-reference-removed");
    expect((revisions.find((row) => row.action === "material-reference-added")!.detail as Record<string, unknown>).status).toBe("active");
  });
  it("does not change a resolution or its review packet when meeting preparation references change", async () => {
    const f = await reviewFixture(); await f.start();
    const before = await f.get();
    await f.repo.addMaterialReference({ meetingId: f.meeting.id, expectedVersion: before.meeting.version, actorEmail: "chair@example.invalid", document });
    expect((await f.get()).asyncBallots).toEqual(before.asyncBallots);
  });
  it("blocks changes after cancellation and rejects another meeting's reference", async () => {
    const client = fakeClient(), repo = createBoardMeetingsRepository(client, "Meetings");
    let meeting = await repo.createMeeting(newMeeting());
    await expect(repo.removeMaterialReference({ meetingId: meeting.id, expectedVersion: meeting.version, referenceId: "foreign-reference", actorEmail: "chair@example.invalid" })).rejects.toThrow(/not found/);
    meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "cancelled", actorEmail: "chair@example.invalid", cancellationReason: "Superseded" });
    await expect(repo.addMaterialReference({ meetingId: meeting.id, expectedVersion: meeting.version, actorEmail: "chair@example.invalid", document })).rejects.toThrow(/active meeting/);
  });
});
