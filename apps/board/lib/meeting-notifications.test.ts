import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MEETING_NOTIFICATION_PREFERENCE as defaults, parseNotificationPreference } from "./meeting-notifications";
import { notificationBallotVisible, notificationMeetingVisible } from "./meeting-notification-access";
import { createMeetingNotificationsRepository } from "./meeting-notifications-repository";
import { meetingNotificationItems } from "./meeting-notification-events";
import { reviewFixture } from "./test-support/meeting-review-repository";
import type { BoardAccessRecord } from "./board-access";

describe("meeting subscriptions", () => {
  it("defaults off and rejects empty, unknown, hidden or ineffective selections", () => {
    expect(defaults.enabled).toBe(false);
    const valid = { ...defaults, enabled: true };
    expect(parseNotificationPreference(valid, [])).toEqual(valid);
    for (const value of [null, { ...valid, categories: ["unknown"] }, { ...valid, categories: [] }, { ...valid, scope: "items", ballotIds: [] }, { ...valid, scope: "items", ballotIds: ["hidden"] }, { ...valid, scope: "items", ballotIds: ["b"], categories: ["meeting"] }, { ...valid, version: -1 }]) expect(() => parseNotificationPreference(value, ["b"])).toThrow();
    expect(parseNotificationPreference({ ...valid, scope: "items", ballotIds: ["b", "b"], categories: ["discussion", "meeting"] }, ["b"])).toMatchObject({ ballotIds: ["b"], categories: ["discussion"] });
    // Users can always turn off even if a previously selected item is no longer visible.
    expect(parseNotificationPreference({ ...defaults, scope: "items", ballotIds: ["hidden"] }, []).enabled).toBe(false);
  });
  it("mirrors meeting and draft-resolution visibility", () => {
    expect(notificationMeetingVisible("draft", "board-support")).toBe(true);
    expect(notificationMeetingVisible("draft", "member")).toBe(false);
    expect(notificationBallotVisible({ status: "draft" }, "board-support")).toBe(false);
    expect(notificationBallotVisible({ status: "draft", review: { everStarted: true } }, "member")).toBe(true);
    expect(notificationBallotVisible({ status: "draft", review: { everStarted: true } }, "legal-counsel")).toBe(false);
  });
  it("binds preferences to the caller and conditionally saves them with an active access guard", async () => {
    const client = { get: vi.fn().mockResolvedValue({}), transactWrite: vi.fn() };
    const repo = createMeetingNotificationsRepository(client, "Meetings");
    expect(await repo.get("m", "a")).toEqual(defaults);
    const access = { id: "a", email: "a@example.invalid", status: "active", version: 4 } as BoardAccessRecord;
    const saved = await repo.save("m", { id: "auth" }, access, { ...defaults, enabled: true });
    expect(saved.version).toBe(1);
    const tx = client.transactWrite.mock.calls[0][0].TransactItems;
    expect(tx[0].Put.Item).toMatchObject({ pk: "MEETING_NOTICE#m", sk: "PREFERENCE#a", accessId: "a", userId: "auth", email: access.email, enabled: true });
    expect(tx[0].Put.ConditionExpression).toBe("attribute_not_exists(pk)");
    expect(tx[1].ConditionCheck.ExpressionAttributeValues).toMatchObject({ ":version": 4, ":active": "active" });
    await repo.save("m", { id: "auth" }, access, { ...saved, enabled: false });
    expect(client.transactWrite.mock.calls[1][0].TransactItems[0].Put.ExpressionAttributeValues).toEqual({ ":version": 1 });
    await expect(repo.save("m", { id: "auth" }, { ...access, status: "deactivated" }, saved)).rejects.toThrow(/Active/);
    client.get.mockResolvedValue({ Item: tx[0].Put.Item });
    expect(await repo.get("m", "a")).not.toHaveProperty("email");
  });
  it("writes private review events atomically and keeps them out of meeting aggregates", async () => {
    const f = await reviewFixture(); const tx = vi.spyOn(f.client, "transactWrite");
    await f.start(); await f.submit(1, { assessment: "PRIVATE ASSESSMENT" });
    const writes = tx.mock.calls.at(-1)![0].TransactItems;
    const event = writes.find((w) => w.Put?.Item?.entityType === "MEETING_NOTIFICATION_EVENT")!.Put!.Item!;
    expect(event).toMatchObject({ pk: `MEETING_NOTICE#${f.meeting.id}`, ballotId: f.draft.id, action: "resolution-review-submitted", directorsOnly: true, ballotDraft: true, reviewStarted: true });
    expect(JSON.stringify(event)).not.toContain("PRIVATE ASSESSMENT");
    expect(JSON.stringify(await f.get())).not.toContain("MEETING_NOTIFICATION_EVENT");
    const count = [...f.client.items.values()].filter((r) => r.entityType === "MEETING_NOTIFICATION_EVENT").length;
    await expect(f.submit(1, { expectedVersion: 1 })).rejects.toThrow();
    expect([...f.client.items.values()].filter((r) => r.entityType === "MEETING_NOTIFICATION_EVENT")).toHaveLength(count);
  });
  it("does not recursively notify for delivery bookkeeping or unknown actions", () => {
    for (const action of ["delivery-recorded", "review-reply-notice", "created", "unknown"]) expect(meetingNotificationItems({ meetingId: "m", action, actor: "a", at: "now", meetingDraft: false })).toEqual([]);
  });
});
