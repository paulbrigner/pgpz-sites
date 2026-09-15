// Board-only stream consumer. Embedded unchanged in the backend Lambda.
// Dependencies are provided by the Node.js Lambda runtime; tests inject clients.
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

const directors = new Set(["member", "chair", "admin"]);
const managers = new Set(["chair", "admin", "executive-director"]);
const roles = new Set([...directors, "executive-director", "board-support", "legal-counsel"]);
const preparer = (role) => managers.has(role) || role === "board-support";
const normalize = (value) => String(value || "").trim().toLowerCase();
const conditional = (error) => ["TransactionCanceledException", "ConditionalCheckFailedException"].includes(error?.name);

function matches(event, preference, access) {
  if (!preference.enabled || preference.updatedAt >= event.at || access?.status !== "active" || !roles.has(access.role) ||
      access.id !== preference.accessId || normalize(access.email) !== normalize(preference.email)) return false;
  if (!Array.isArray(preference.categories) || !event.categories.some((c) => preference.categories.includes(c) && (c !== "reviews" || directors.has(access.role)))) return false;
  if (preference.scope !== "meeting" && !(preference.scope === "items" && event.ballotId && preference.ballotIds?.includes(event.ballotId))) return false;
  if (!preference.includeOwn && [preference.userId, preference.accessId, preference.email].some((id) => normalize(id) === normalize(event.actor))) return false;
  if (event.meetingDraft && !preparer(access.role)) return false;
  if (event.directorsOnly && !directors.has(access.role)) return false;
  if (event.ballotDraft && !managers.has(access.role) && !(event.reviewStarted && directors.has(access.role))) return false;
  return true;
}

function notificationEmail(event, to, from, siteUrl) {
  const meetingUrl = `${siteUrl}/meetings/${encodeURIComponent(event.meetingId)}`;
  const link = event.sessionId ? `${meetingUrl}/executive-sessions/${encodeURIComponent(event.sessionId)}` : `${meetingUrl}${event.ballotId ? `#ballot-${encodeURIComponent(event.ballotId)}` : ""}`;
  const labels = {
    meeting: "Meeting details, agenda or attendance changed.", materials: "Meeting materials or resolution attachments changed.",
    resolutions: "A resolution or its consent window changed.", discussion: "A resolution discussion was updated.",
    reviews: "Director review activity was updated.", consents: "Consent progress was updated.",
    records: "Meeting records or follow-up tasks changed.", executive: "An Executive Session you can access was updated.",
  };
  const description = event.action === "written-consent-adopted" ? "A resolution was adopted." : labels[event.categories[0]] || "A meeting you follow was updated.";
  return {
    FromEmailAddress: from, Destination: { ToAddresses: [to] },
    Content: { Simple: {
      Subject: { Data: "PGPZ Board: meeting update", Charset: "UTF-8" },
      Body: { Text: { Data: `${description}\n\nView the update (sign-in required):\n${link}\n\nYou opted in to updates for this meeting. Change your filters or turn off these emails:\n${meetingUrl}#meeting-notifications\n\nOfficial meeting notices and direct assessment replies are managed separately.`, Charset: "UTF-8" } },
    } },
  };
}

function createWorker({ db, send, meetingsTable, accessTable, from, siteUrl, enabled = false, log = console, now = () => new Date().toISOString() }) {
  const get = async (table, key) => (await db.get({ TableName: table, Key: key, ConsistentRead: true })).Item;
  async function deliver(event, preference) {
    const access = await get(accessTable, { pk: `ACCESS#${preference.accessId}`, sk: "PROFILE" });
    if (!matches(event, preference, access)) return;
    const meetingKey = { pk: `MEETING#${event.meetingId}`, sk: "META" };
    const meeting = await get(meetingsTable, meetingKey);
    if (!meeting || (meeting.status === "draft" && !preparer(access.role))) return;
    if (event.ballotId) {
      const ballot = await get(meetingsTable, { pk: meetingKey.pk, sk: `BALLOT#${event.ballotId}` });
      if (!ballot || (ballot.status === "draft" && !managers.has(access.role) && !(directors.has(access.role) && ballot.review?.everStarted))) return;
    }
    const sessionGuards = [];
    if (event.sessionId) {
      // Check admission before fetching any private session metadata.
      const grant = (await get(meetingsTable, { pk: `EXECUTIVE_SESSION#${event.sessionId}`, sk: `PARTICIPANT#${access.id}` }))?.value;
      if (!grant || grant.accessId !== access.id || normalize(grant.email) !== normalize(access.email) || grant.meetingId !== event.meetingId ||
          !(grant.kind === "director" && directors.has(access.role) || grant.kind === "counsel" && access.role === "legal-counsel")) return;
      const sessionKey = { pk: `EXECUTIVE_SESSION#${event.sessionId}`, sk: "META" };
      const session = (await get(meetingsTable, sessionKey))?.value;
      if (!session || session.meetingId !== event.meetingId || !session.participants?.some((p) => p.accessId === access.id && normalize(p.email) === normalize(access.email) && p.kind === grant.kind)) return;
      sessionGuards.push({ ConditionCheck: { TableName: meetingsTable, Key: sessionKey, ConditionExpression: "#version = :version", ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": session.version } } });
    }
    if (event.replyId && event.ballotId) {
      const direct = await get(meetingsTable, { pk: `RESOLUTION_REVIEW#${event.meetingId}#${event.ballotId}`, sk: `NOTICE#${event.replyId}` });
      // The existing direct reply notifier owns this recipient even while pending.
      if (direct?.recipient?.accessId === access.id) return;
    }
    const key = { pk: event.pk, sk: `DELIVERY#${event.id}#${access.id}` };
    if (await get(meetingsTable, key)) return;
    const claim = { ...key, entityType: "MEETING_NOTIFICATION_DELIVERY", eventId: event.id, accessId: access.id, status: "sending", claimedAt: now() };
    try {
      await db.transactWrite({ TransactItems: [
        ...sessionGuards,
        { Put: { TableName: meetingsTable, Item: claim, ConditionExpression: "attribute_not_exists(pk)" } },
        { ConditionCheck: { TableName: meetingsTable, Key: { pk: preference.pk, sk: preference.sk }, ConditionExpression: "#version = :version AND enabled = :enabled", ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": preference.version, ":enabled": true } } },
        { ConditionCheck: { TableName: accessTable, Key: { pk: access.pk, sk: access.sk }, ConditionExpression: "#version = :version AND #status = :status", ExpressionAttributeNames: { "#version": "version", "#status": "status" }, ExpressionAttributeValues: { ":version": access.version, ":status": "active" } } },
        { ConditionCheck: { TableName: meetingsTable, Key: meetingKey, ConditionExpression: "#version = :version", ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": meeting.version } } },
      ] });
    } catch (error) {
      if (conditional(error)) {
        // Retry a racing change from fresh reads, but never retry an existing claim.
        if (await get(meetingsTable, key)) return;
      }
      throw error;
    }
    let status = "sent";
    let messageId;
    try {
      const result = await send(notificationEmail(event, access.email, from, siteUrl));
      messageId = result?.MessageId;
    } catch {
      // SES cannot be safely retried after an ambiguous response.
      status = "unknown";
      log.error("NOTIFICATION_SEND_UNKNOWN", { eventId: event.id, accessId: access.id });
    }
    await db.put({ TableName: meetingsTable, Item: { ...claim, status, completedAt: now(), ...(messageId ? { messageId } : {}) }, ConditionExpression: "#status = :sending", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":sending": "sending" } });
  }
  async function processEvent(event, context) {
    if (!enabled) throw new Error("Meeting notification delivery is disabled");
    if (event.entityType !== "MEETING_NOTIFICATION_EVENT" || !event.id || event.pk !== `MEETING_NOTICE#${event.meetingId}` || !event.at || !Array.isArray(event.categories)) throw new Error("Invalid meeting notification event");
    let cursor;
    do {
      const page = await db.query({ TableName: meetingsTable, ConsistentRead: true, KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)", ExpressionAttributeValues: { ":pk": event.pk, ":prefix": "PREFERENCE#" }, ...(cursor ? { ExclusiveStartKey: cursor } : {}) });
      for (const preference of page.Items || []) {
        if (context?.getRemainingTimeInMillis && context.getRemainingTimeInMillis() < 15000) throw new Error("Insufficient time for delivery");
        await deliver(event, preference);
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
  }
  return { processEvent, async handler(input, context) {
    // Read-only invocation used by deployment checks. Never reads recipients or sends.
    if (input?.validate_only === true && !input.Records) return { valid: Boolean(meetingsTable && accessTable && from && /^https:\/\//.test(siteUrl)), enabled };
    const failures = [];
    for (const record of input.Records || []) {
      if (record.eventName !== "INSERT" || record.dynamodb?.NewImage?.entityType?.S !== "MEETING_NOTIFICATION_EVENT") continue;
      try {
        // Fetch the retained event instead of unmarshalling arbitrary stream payloads.
        const event = await get(meetingsTable, { pk: record.dynamodb.Keys.pk.S, sk: record.dynamodb.Keys.sk.S });
        if (!event) throw new Error("Missing retained notification event");
        await processEvent(event, context);
      } catch {
        log.error("NOTIFICATION_EVENT_FAILED", { sequenceNumber: record.dynamodb.SequenceNumber });
        failures.push({ itemIdentifier: record.dynamodb.SequenceNumber });
      }
    }
    return { batchItemFailures: failures };
  } };
}

exports.createWorker = createWorker;
exports.matches = matches;
exports.notificationEmail = notificationEmail;
let worker;
exports.handler = (input, context) => {
  if (!worker) {
    const db = DynamoDBDocument.from(new DynamoDBClient({}));
    const ses = new SESv2Client({ maxAttempts: 1, requestHandler: { requestTimeout: 8000, connectionTimeout: 3000 } });
    worker = createWorker({ db, send: (email) => ses.send(new SendEmailCommand(email)), meetingsTable: process.env.MEETINGS_TABLE, accessTable: process.env.ACCESS_TABLE, from: process.env.EMAIL_FROM, siteUrl: process.env.SITE_URL, enabled: process.env.DELIVERY_ENABLED === "true" });
  }
  return worker.handler(input, context);
};
