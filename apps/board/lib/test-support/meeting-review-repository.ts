import type { BoardAccessRecord } from "@/lib/board-access";
import { createBoardMeetingsRepository } from "@/lib/meetings-repository";

type Row = Record<string, unknown>;

export function fakeClient() {
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
        if (check) {
          const current = items.get(keyOf(check.Key || {}));
          if (!current || (check.ExpressionAttributeValues?.[":revision"] !== undefined && current.revision !== check.ExpressionAttributeValues[":revision"]) || (check.ExpressionAttributeValues?.[":version"] !== undefined && (current.version !== check.ExpressionAttributeValues[":version"] || current.status !== "active"))) throw { name: "TransactionCanceledException" };
        }
        const put = entry.Put;
        if (!put?.Item) continue;
        const key = keyOf(put.Item);
        const current = items.get(key);
        if (put.ConditionExpression?.includes("attribute_not_exists") && current && !(put.ConditionExpression.includes(" OR ") && current.status === "failed")) throw { name: "TransactionCanceledException" };
        if (put.ConditionExpression?.includes("#attemptId") && (current?.attemptId !== put.ExpressionAttributeValues?.[":attemptId"] || current?.status !== put.ExpressionAttributeValues?.[":pending"])) throw { name: "TransactionCanceledException" };
        const expected = put.ExpressionAttributeValues?.[":expectedVersion"];
        if (put.ExpressionAttributeValues?.[":expectedStatus"] !== undefined && current?.status !== put.ExpressionAttributeValues[":expectedStatus"]) throw { name: "TransactionCanceledException" };
        if (expected !== undefined && current?.version !== expected) throw { name: "TransactionCanceledException" };
      }
      for (const entry of TransactItems) if (entry.Put?.Item) items.set(keyOf(entry.Put.Item), entry.Put.Item);
    },
  };
}

export function rosterFor(client: ReturnType<typeof fakeClient>, voters: { userId: string; name: string; email: string }[]) {
  const roster = { revision: "roster-1", ready: true, directors: voters.map((voter) => ({ ...voter, status: "active" })) };
  client.items.set("DIRECTOR_ROSTER#STATE", roster);
  for (const voter of voters) client.items.set(`ACCESS#${voter.userId}#PROFILE`, { id: voter.userId, name: voter.name, email: voter.email, role: "member", status: "active", version: 1 });
  return roster;
}
export function newMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: "meeting-1", title: "Quarterly Board Meeting", description: "", type: "regular" as const,
    startAt: "2026-09-10T14:00:00-04:00", endAt: "2026-09-10T16:00:00-04:00",
    timeZone: "America/New_York", location: "Online", virtualUrl: "https://meet.example.org/board",
    actorEmail: "chair@pgpz.org", occurredAt: "2026-08-13T12:00:00Z", ...overrides,
  };
}

export async function reviewFixture() {
  const client = fakeClient(), repo = createBoardMeetingsRepository(client, "Meetings");
  let meeting = await repo.createMeeting(newMeeting({ format: "asynchronous", endAt: "2026-09-16T21:00:00Z" }));
  meeting = await repo.changeStatus({ id: meeting.id, expectedVersion: meeting.version, status: "scheduled", actorEmail: "chair@pgpz.org" });
  const voters = Array.from({ length: 5 }, (_, i) => ({ userId: `director-${i}`, name: `Director ${i}`, email: `director${i}@example.org` }));
  const roster = rosterFor(client, voters);
  const access = (i: number) => client.items.get(`ACCESS#director-${i}#PROFILE`) as unknown as BoardAccessRecord;
  client.items.set("ACCESS#director-0#PROFILE", { ...access(0), role: "chair" });
  const get = async () => (await repo.getMeeting(meeting.id))!;
  const draft = { meetingId: meeting.id, id: "review-ballot", title: "Approve employment", motion: "Adopt the attached revised employment resolution.", attachments: [{ documentId: "employment", versionId: "v2", sequence: 2, title: "Employment resolution", fileName: "employment.pdf", sha256: "b".repeat(64) }], adoption: { targets: [{ documentId: "employment", versionId: "v2" }], effectiveTerms: "Upon adoption" }, review: { instructions: "Review compensation, conflicts, initial services and the outside-client exception." }, reviewCoordinator: access(0), actorEmail: voters[0].email, occurredAt: "2026-09-09T13:00:00Z" };
  await repo.upsertAsyncBallot({ ...draft, expectedVersion: meeting.version });
  const start = async () => repo.startResolutionReview({ meetingId: meeting.id, expectedVersion: (await get()).meeting.version, ballotId: draft.id, roster, rosterConfirmed: true, accessRecord: access(0), occurredAt: "2026-09-09T14:00:00Z" });
  const submit = async (i: number, extra: Partial<Parameters<typeof repo.submitResolutionReview>[0]> = {}) => {
    const current = await get(), round = current.asyncBallots[0].review!.round!;
    return repo.submitResolutionReview({ meetingId: meeting.id, expectedVersion: current.meeting.version, ballotId: draft.id, roundId: round.id, contentHash: round.contentHash, roster, accessRecord: access(i), authenticatedUserId: `auth-${i}`, reviewedOn: "2026-09-09", outcome: "ready", conflict: "none", assessment: `Director ${i} reviewed the sources and considers the compensation reasonable for the duties and available resources.`, attested: true, occurredAt: "2026-09-09T15:00:00Z", ...extra });
  };
  const open = async (extra: Partial<Parameters<typeof repo.openAsyncBallot>[0]> = {}) => repo.openAsyncBallot({ meetingId: meeting.id, expectedVersion: (await get()).meeting.version, ballotId: draft.id, roster, rosterConfirmed: true, eligibleVoters: voters, actorEmail: voters[0].email, reviewCoordinator: access(0), reviewRecordConfirmed: true, reviewFindings: "The directors completed the requested reviews and the proposed terms reflect their documented findings.", occurredAt: "2026-09-10T20:00:00Z", ...extra });
  return { client, repo, meeting, draft, roster, voters, access, get, start, submit, open };
}
