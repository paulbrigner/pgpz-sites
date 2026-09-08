// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createExecutiveSessionsRepository } from "./executive-sessions-repository";
import { executiveFakeClient, sessionFixture } from "./executive-session-test-helpers";
import { createBoardDocumentRepository } from "./documents-repository";

describe("restricted session persistence", () => {
  it("retains immutable contributions and closure, checks concurrent writes, and publishes only an explicit report", async () => {
    const client = executiveFakeClient(); const repo = createExecutiveSessionsRepository(client, "Meetings");
    const initial = sessionFixture();
    let session = await repo.create(initial, []);
    for (let index = 0; index < 5; index++) session = await repo.append(session, {
      id: `m-${index}`, authorId: "director", authorName: "Director", body: `PRIVATE message ${index}`, createdAt: `2026-09-08T12:00:0${index}Z`,
    }, "MESSAGE", []);
    expect(await repo.messages(session.id)).toHaveLength(5);
    await expect(repo.close(initial, "director", [])).rejects.toMatchObject({ status: 409 });
    await expect(repo.publish(session, "Premature", "Director", [])).rejects.toMatchObject({ status: 409 });
    session = await repo.close(session, "director", []);
    await expect(repo.append(session, { id: "late", authorId: "director", authorName: "Director", body: "late", createdAt: "now" }, "MESSAGE", [])).rejects.toMatchObject({ status: 409 });
    const closed = session;
    session = await repo.publish(session, "Reviewed shareable conclusion", "Director", []);
    await expect(repo.publish(closed, "Duplicate", "Director", [])).rejects.toMatchObject({ status: 409 });
    expect(await repo.reports(session.meetingId)).toEqual([expect.objectContaining({ summary: "Reviewed shareable conclusion" })]);
    const ordinaryRows = [...client.items.values()].filter((row) => row.pk === "MEETING#meeting-1");
    expect(JSON.stringify(ordinaryRows)).not.toContain("PRIVATE");
    expect(JSON.stringify(ordinaryRows)).not.toContain("counsel@example.invalid");
    expect([...client.items.values()].filter((row) => String(row.sk).startsWith("REVISION#"))).toHaveLength(8);
  });

  it("never registers restricted files with ordinary library or meeting-document APIs", async () => {
    const client = executiveFakeClient(); const repo = createExecutiveSessionsRepository(client, "Meetings");
    const session = await repo.create(sessionFixture(), []);
    await repo.append(session, { id: "private-file", title: "PRIVATE schedule A", fileName: "salary.pdf", objectKey: "board/objects/private-file/version",
      sha256: "abc", byteLength: 100, mimeType: "application/pdf", createdAt: "2026-09-08T12:00:00Z", createdBy: "director" }, "MATERIAL", []);
    const vault = createBoardDocumentRepository(client);
    expect(await vault.getDocument("private-file")).toBeNull();
    expect(await vault.listDocuments()).toEqual([]);
    expect(await vault.listMeetingDocuments("meeting-1")).toEqual([]);
    expect(await repo.materials(session.id)).toHaveLength(1);
  });

  it("aborts the entire mutation when the roster guard is stale", async () => {
    const client = executiveFakeClient(); const repo = createExecutiveSessionsRepository(client, "Meetings");
    const session = await repo.create(sessionFixture(), []);
    client.seed("Access", { pk: "ACCESS#director", sk: "PROFILE", version: 2, status: "deactivated" });
    await expect(repo.close(session, "director", [{ ConditionCheck: { TableName: "Access", Key: { pk: "ACCESS#director", sk: "PROFILE" },
      ConditionExpression: "#version = :version AND #status = :active", ExpressionAttributeValues: { ":version": 1, ":active": "active" } } }])).rejects.toMatchObject({ status: 409 });
    expect((await repo.get(session.id))?.status).toBe("open");
  });
});
