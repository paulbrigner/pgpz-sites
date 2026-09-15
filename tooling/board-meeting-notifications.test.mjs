import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { buildBoardBackendTemplate } from "./board-backend-cloudformation.mjs";
import { buildCliPlan, parseArguments } from "./provision-board-backend.mjs";
const { createWorker, matches, notificationEmail } = createRequire(import.meta.url)("../apps/board/workers/meeting-notifications.cjs");

const event = { pk: "MEETING_NOTICE#m1", sk: "EVENT#e1", entityType: "MEETING_NOTIFICATION_EVENT", id: "e1", meetingId: "m1", at: "2026-09-15T12:00:00.000Z", actor: "someone-else", action: "discussion-created", categories: ["discussion"], ballotId: "b1", meetingDraft: false, directorsOnly: false };
const pref = { pk: event.pk, sk: "PREFERENCE#a1", enabled: true, scope: "meeting", categories: ["discussion", "reviews", "executive"], ballotIds: [], includeOwn: false, accessId: "a1", userId: "u1", email: "director@example.org", version: 1, updatedAt: "2026-09-15T11:00:00.000Z" };
const access = { pk: "ACCESS#a1", sk: "PROFILE", id: "a1", email: pref.email, status: "active", role: "member", version: 1 };
function fixture(overrides = {}) {
  const rows = new Map(); const sent = []; const logs = []; const writes = [];
  const key = (row) => `${row.pk}|${row.sk}`;
  const store = (row) => rows.set(key(row), structuredClone(row));
  [event, pref, access, { pk: "MEETING#m1", sk: "META", status: "scheduled", version: 1 }, { pk: "MEETING#m1", sk: "BALLOT#b1", status: "open" }].forEach(store);
  const db = {
    get: async ({ Key }) => ({ Item: structuredClone(rows.get(key(Key))) }),
    query: async ({ ExpressionAttributeValues: v }) => ({ Items: [...rows.values()].filter((r) => r.pk === v[":pk"] && r.sk.startsWith(v[":prefix"])).map((r) => structuredClone(r)) }),
    transactWrite: async ({ TransactItems }) => {
      writes.push(TransactItems);
      for (const item of TransactItems) {
        const statement = item.Put || item.ConditionCheck;
        const current = rows.get(key(statement.Item || statement.Key));
        if (item.Put && current || item.ConditionCheck && (!current || Object.entries(statement.ExpressionAttributeValues).some(([k, v]) => current[k.slice(1)] !== v))) throw Object.assign(new Error("racing write"), { name: "TransactionCanceledException" });
      }
      for (const item of TransactItems) if (item.Put) store(item.Put.Item);
    },
    put: async ({ Item }) => store(Item),
  };
  const worker = createWorker({ db, send: async (email) => { sent.push(email); return { MessageId: "ses-1" }; }, meetingsTable: "BoardMeetings", accessTable: "BoardAccess", from: "PGPZ Board <board@pgpz.org>", siteUrl: "https://board.pgpz.org", enabled: true, log: { error: (...args) => logs.push(args) }, ...overrides });
  return { worker, rows, store, sent, logs, db, writes, delivery: () => rows.get(`${event.pk}|DELIVERY#e1#a1`) };
}
test("opt-in, category, item, event-time and own-activity filters", () => {
  assert.equal(matches(event, pref, access), true);
  for (const change of [{ enabled: false }, { categories: [] }, { scope: "items", ballotIds: ["other"] }, { updatedAt: event.at }, { updatedAt: "2026-09-16T00:00:00Z" }]) assert.equal(matches(event, { ...pref, ...change }, access), false);
  assert.equal(matches(event, { ...pref, scope: "items", ballotIds: ["b1"] }, access), true);
  assert.equal(matches({ ...event, ballotId: undefined }, { ...pref, scope: "items", ballotIds: ["b1"] }, access), false);
  for (const actor of [pref.userId, pref.accessId, pref.email.toUpperCase()]) assert.equal(matches({ ...event, actor }, pref, access), false);
  assert.equal(matches({ ...event, actor: pref.email }, { ...pref, includeOwn: true }, access), true);
});
test("every active Board role can follow accessible updates; draft and director-only events stay restricted", () => {
  for (const role of ["member", "chair", "admin", "executive-director", "legal-counsel", "board-support"]) {
    assert.equal(matches(event, pref, { ...access, role }), true);
    assert.equal(matches({ ...event, directorsOnly: true }, pref, { ...access, role }), ["member", "chair", "admin"].includes(role));
    assert.equal(matches({ ...event, meetingDraft: true }, pref, { ...access, role }), ["chair", "admin", "executive-director", "board-support"].includes(role));
    assert.equal(matches({ ...event, ballotDraft: true }, pref, { ...access, role }), ["chair", "admin", "executive-director"].includes(role));
  }
  for (const change of [{ status: "deactivated" }, { status: "invited" }, { email: "changed@example.org" }, { id: "new-id" }, { role: "unknown" }]) assert.equal(matches(event, pref, { ...access, ...change }), false);
  assert.equal(matches({ ...event, ballotDraft: true, reviewStarted: true }, pref, access), true);
});
test("sends to exactly one registered recipient and does not resend on stream replay", async () => {
  const f = fixture(); await f.worker.processEvent(event); await f.worker.processEvent(event);
  assert.equal(f.sent.length, 1); assert.deepEqual(f.sent[0].Destination, { ToAddresses: [access.email] });
  assert.equal(f.delivery().status, "sent"); assert.equal(f.delivery().messageId, "ses-1");
  assert.equal(f.writes[0].filter((i) => i.ConditionCheck).length, 3);
});
test("rechecks opt-out and access on delivery, with no claim or email to an unauthorized user", async () => {
  for (const changed of [{ ...pref, enabled: false }, { ...access, role: "board-support" }]) {
    const f = fixture(); f.store(changed); await f.worker.processEvent({ ...event, directorsOnly: true }); assert.equal(f.sent.length, 0); assert.equal(f.delivery(), undefined);
  }
  const f = fixture(); f.store({ pk: "MEETING#m1", sk: "BALLOT#b1", status: "draft" }); await f.worker.processEvent(event); assert.equal(f.sent.length, 0);
});
test("role changes or opt-out between read and claim cause a safe retry from fresh state", async () => {
  const f = fixture(); const transact = f.db.transactWrite;
  f.db.transactWrite = async (input) => { f.store({ ...pref, enabled: false, version: 2 }); await transact(input); };
  await assert.rejects(f.worker.processEvent(event)); assert.equal(f.sent.length, 0); assert.equal(f.delivery(), undefined);
  await f.worker.processEvent(event); assert.equal(f.sent.length, 0);
});
test("Executive Session updates require a matching admission and current eligible role", async () => {
  const privateEvent = { ...event, ballotId: undefined, sessionId: "s1", categories: ["executive"] };
  const f = fixture(); await f.worker.processEvent(privateEvent); assert.equal(f.sent.length, 0);
  const grant = { pk: "EXECUTIVE_SESSION#s1", sk: "PARTICIPANT#a1", value: { accessId: "a1", email: access.email, meetingId: "m1", kind: "director" } };
  f.store(grant); f.store({ ...access, role: "executive-director" }); await f.worker.processEvent(privateEvent); assert.equal(f.sent.length, 0);
  f.store({ ...access, role: "legal-counsel" }); f.store({ ...grant, value: { ...grant.value, kind: "counsel" } });
  await f.worker.processEvent(privateEvent); assert.equal(f.sent.length, 0);
  f.store({ pk: "EXECUTIVE_SESSION#s1", sk: "META", version: 1, value: { meetingId: "m1", version: 1, participants: [{ accessId: access.id, email: access.email, kind: "counsel" }] } });
  await f.worker.processEvent(privateEvent); assert.equal(f.sent.length, 1);
});
test("assessment reply direct recipient is not emailed twice", async () => {
  const f = fixture(); f.store({ pk: "RESOLUTION_REVIEW#m1#b1", sk: "NOTICE#r1", status: "pending", recipient: { accessId: access.id } });
  await f.worker.processEvent({ ...event, replyId: "r1", categories: ["reviews"], directorsOnly: true }); assert.equal(f.sent.length, 0);
});
test("ambiguous SES responses and unfinished claims are never automatically resent", async () => {
  let calls = 0;
  const f = fixture({ send: async () => { calls++; throw new Error("response lost"); } });
  await f.worker.processEvent(event); await f.worker.processEvent(event); assert.equal(calls, 1); assert.equal(f.delivery().status, "unknown"); assert.equal(f.logs[0][0], "NOTIFICATION_SEND_UNKNOWN");
  const g = fixture(); g.db.put = async () => { throw new Error("completion write failed"); };
  await assert.rejects(g.worker.processEvent(event)); await g.worker.processEvent(event); assert.equal(g.sent.length, 1); assert.equal(g.delivery().status, "sending");
});
test("worker paginates subscribers and validate_only cannot send", async () => {
  const f = fixture(); let pages = 0; const query = f.db.query;
  f.db.query = async (input) => { pages++; return input.ExclusiveStartKey ? query(input) : { Items: [], LastEvaluatedKey: { pk: event.pk, sk: "cursor" } }; };
  assert.deepEqual(await f.worker.handler({ validate_only: true }), { valid: true, enabled: true }); assert.equal(pages, 0);
  await f.worker.processEvent(event); assert.equal(pages, 2); assert.equal(f.sent.length, 1);
});
test("partial failure reports DynamoDB sequence numbers and ignores non-event stream rows", async () => {
  const f = fixture({ enabled: false });
  const record = { eventID: "not-the-sequence", eventName: "INSERT", dynamodb: { SequenceNumber: "1234", Keys: { pk: { S: event.pk }, sk: { S: event.sk } }, NewImage: { entityType: { S: event.entityType } } } };
  assert.deepEqual(await f.worker.handler({ Records: [record, { ...record, eventName: "MODIFY" }] }), { batchItemFailures: [{ itemIdentifier: "1234" }] }); assert.equal(f.sent.length, 0);
});
test("email includes authenticated links but no private text, titles, signature or actor", () => {
  const email = notificationEmail({ ...event, title: "SECRET TITLE", body: "SECRET BODY", actor: "secret@org.test" }, access.email, "board@pgpz.org", "https://board.pgpz.org");
  assert.doesNotMatch(JSON.stringify(email), /SECRET|secret@/); assert.match(email.Content.Simple.Body.Text.Data, /meetings\/m1#ballot-b1/); assert.match(email.Content.Simple.Body.Text.Data, /#meeting-notifications/);
});
test("infrastructure retains failed events, filters the stream and defaults delivery off", () => {
  const t = buildBoardBackendTemplate(), r = t.Resources;
  assert.equal(t.Parameters.BoardMeetingNotificationDelivery.Default, "false");
  assert.deepEqual(r.BoardMeetingsTable.Properties.StreamSpecification, { StreamViewType: "NEW_IMAGE" });
  const mapping = r.BoardMeetingNotificationsEventSource.Properties;
  assert.equal(mapping.StartingPosition, "TRIM_HORIZON"); assert.deepEqual(mapping.FunctionResponseTypes, ["ReportBatchItemFailures"]);
  assert.equal(mapping.MaximumRetryAttempts, 10); assert.match(JSON.stringify(mapping.FilterCriteria), /MEETING_NOTIFICATION_EVENT/);
  assert.equal(r.BoardMeetingNotificationsFailures.DeletionPolicy, "Retain"); assert.equal(r.BoardMeetingNotificationsFailures.Properties.PublicAccessBlockConfiguration.BlockPublicPolicy, true);
  const role = JSON.stringify(r.BoardMeetingNotificationsRole);
  assert.doesNotMatch(role, /Community|Coalition|DeleteItem|Scan|SendRawEmail/); assert.match(role, /ConditionCheckItem/); assert.match(role, /LeadingKeys/);
  const statements = r.BoardMeetingNotificationsRole.Properties.Policies[0].PolicyDocument.Statement;
  const wildcard = statements.filter((s) => s.Resource === "*");
  assert.deepEqual(wildcard.map((s) => s.Action), [["dynamodb:ListStreams"]]);
  assert.deepEqual(wildcard[0].Condition, { StringEquals: { "aws:RequestedRegion": { Ref: "AWS::Region" } } });
  assert.ok(Buffer.byteLength(JSON.stringify(t)) < 51200);
  assert.equal(buildCliPlan(parseArguments(["--account-id", "123456789012", "--notification-delivery", "true"])).notificationDelivery, "true");
  assert.throws(() => buildCliPlan(parseArguments(["--account-id", "123456789012", "--notification-delivery", "yes"])));
});
