import { describe, expect, it } from "vitest";
import { actionItemDateInput, validateActionItemChanges } from "./action-items";
import { createBoardMeetingsRepository } from "./meetings-repository";
import { fakeClient, newMeeting } from "./test-support/meeting-review-repository";

async function fixture() {
  const client = fakeClient(), repo = createBoardMeetingsRepository(client, "Meetings");
  let meeting = await repo.createMeeting(newMeeting());
  meeting = await repo.recordActionItem({ meetingId: meeting.id, id: "task", expectedVersion: meeting.version, actorEmail: "chair@example.org", description: "File Articles", ownerName: "Secretary", ownerId: "owner", agendaItemId: "agenda", dueAt: "2026-09-30", status: "open" });
  const update = async (changes: Parameters<typeof repo.updateActionItem>[0]["changes"], note?: string) => repo.updateActionItem({ meetingId: meeting.id, id: "task", expectedVersion: (await repo.getMeeting(meeting.id))!.meeting.version, actorEmail: "support@example.org", changes, note });
  return { client, repo, meeting, update };
}
describe("meeting tasks", () => {
  it("preserves hidden metadata through completion, reopening and edits, retaining before/after evidence", async () => {
    const f = await fixture();
    await f.update({ status: "completed" }, "Filing receipt retained");
    expect(await f.repo.getActionItem(f.meeting.id, "task")).toMatchObject({ status: "completed", ownerId: "owner", agendaItemId: "agenda", dueAt: "2026-09-30", description: "File Articles" });
    const revisions = [...f.client.items.values()].filter((r) => r.entityType === "MEETING_REVISION");
    expect(revisions.at(-1)?.detail).toMatchObject({ taskId: "task", before: { status: "open" }, after: { status: "completed" }, note: "Filing receipt retained" });
    await expect(f.update({ description: "Changed" })).rejects.toThrow(/Reopen/);
    await expect(f.update({ status: "cancelled" })).rejects.toThrow(/Reopen/);
    await f.update({ status: "open" }); await f.update({ description: "Retain filing receipt", dueAt: null });
    expect(await f.repo.getActionItem(f.meeting.id, "task")).toMatchObject({ description: "Retain filing receipt", ownerName: "Secretary", ownerId: "owner", agendaItemId: "agenda", dueAt: null });
    await f.update({ status: "cancelled" }); await f.update({ status: "open" });
    expect((await f.repo.getMeeting(f.meeting.id))!.actionItems).toHaveLength(1);
  });
  it.each(["completed", "closed"])("allows follow-through on %s meetings without changing governance state", async (status) => {
    const f = await fixture();
    const key = `MEETING#${f.meeting.id}#META`;
    f.client.items.set(key, { ...f.client.items.get(key), status, minutesStatus: "approved", minutesDocumentId: "minutes" });
    const before = (await f.repo.getMeeting(f.meeting.id))!;
    await f.update({ status: "completed" });
    const after = (await f.repo.getMeeting(f.meeting.id))!;
    expect(after.meeting).toMatchObject({ status, minutesStatus: "approved", minutesDocumentId: "minutes" });
    expect(after.decisions).toEqual(before.decisions); expect(after.asyncBallots).toEqual(before.asyncBallots);
  });
  it("rejects missing, foreign and stale tasks, and commits audit and outbox atomically", async () => {
    const f = await fixture();
    const input = { meetingId: f.meeting.id, id: "task", expectedVersion: f.meeting.version, actorEmail: "chair@example.org", changes: { status: "completed" as const } };
    await expect(f.repo.updateActionItem({ ...input, id: "foreign" })).rejects.toThrow(/not found/);
    const before = JSON.stringify([...f.client.items]);
    await expect(f.repo.updateActionItem(input, { additionalTransactItems: [{ ConditionCheck: { Key: { pk: "audit", sk: "missing" } } }] })).rejects.toThrow(/updated/);
    expect(JSON.stringify([...f.client.items])).toBe(before);
    await f.repo.updateActionItem(input, { additionalTransactItems: [{ Put: { Item: { pk: "audit", sk: "1", action: "task-updated" } } }] });
    expect(f.client.items.get("audit#1")).toBeDefined();
    const notices = [...f.client.items.values()].filter((r) => r.entityType === "MEETING_NOTIFICATION_EVENT");
    expect(notices.at(-1)).toMatchObject({ categories: ["records"] });
    expect(JSON.stringify(notices)).not.toContain("File Articles");
    await expect(f.repo.updateActionItem({ ...input, changes: { status: "open" } })).rejects.toThrow(/updated/);
  });
  it("prevents legacy upserts from bypassing state rules and avoids duplicate no-op events", async () => {
    const f = await fixture();await f.update({ status: "completed" });
    const task = (await f.repo.getActionItem(f.meeting.id, "task"))!;
    await expect(f.repo.recordActionItem({ ...task, status: "cancelled", expectedVersion: (await f.repo.getMeeting(f.meeting.id))!.meeting.version, actorEmail: "chair@example.org" })).rejects.toThrow(/Reopen/);
    const count=f.client.items.size;await f.update({ status: "completed" });expect(f.client.items.size).toBe(count);
  });
  it("validates statuses and dates and preserves a calendar date across timezones", () => {
    for (const change of [{ status: "done" }, { status: ["open"] }, { dueAt: "2026-02-30" }, { ownerName: " " }, { description: "" }, { ownerId: "forged" }]) expect(() => validateActionItemChanges(change)).toThrow();
    expect(validateActionItemChanges({ dueAt: "2026-09-30" })).toEqual({ dueAt: "2026-09-30" });
    expect(actionItemDateInput("2026-09-30", "America/Los_Angeles")).toBe("2026-09-30");
    expect(actionItemDateInput("2026-09-30T01:00:00.000Z", "America/Los_Angeles")).toBe("2026-09-29");
  });
});
