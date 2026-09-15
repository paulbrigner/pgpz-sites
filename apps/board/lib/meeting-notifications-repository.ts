import "server-only";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_MEETINGS_TABLE } from "@/lib/config";
import type { BoardAccessRecord } from "@/lib/board-access";
import { accessRecordGuard } from "@/lib/director-roster";
import { DEFAULT_MEETING_NOTIFICATION_PREFERENCE, type MeetingNotificationPreference } from "@/lib/meeting-notifications";

// Matches the DynamoDBDocument surface used by the other Board repositories.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMeetingNotificationsRepository(client: any = documentClient, tableName = BOARD_MEETINGS_TABLE) {
  const key = (meetingId: string, accessId: string) => ({ pk: `MEETING_NOTICE#${meetingId}`, sk: `PREFERENCE#${accessId}` });
  return {
    async get(meetingId: string, accessId: string): Promise<MeetingNotificationPreference> {
      const result = await client.get({ TableName: tableName, Key: key(meetingId, accessId), ConsistentRead: true });
      const row = result.Item;
      return row ? { enabled: row.enabled, scope: row.scope, ballotIds: row.ballotIds, categories: row.categories, includeOwn: row.includeOwn, version: row.version } : { ...DEFAULT_MEETING_NOTIFICATION_PREFERENCE };
    },
    async save(meetingId: string, member: { id: string }, access: BoardAccessRecord, preference: MeetingNotificationPreference, auditItems: readonly Record<string, unknown>[] = []) {
      if (access.status !== "active") throw new Error("Active Board access is required.");
      const next = { ...preference, version: preference.version + 1 };
      await client.transactWrite({ TransactItems: [
        { Put: {
          TableName: tableName,
          Item: { ...key(meetingId, access.id), ...next, entityType: "MEETING_NOTIFICATION_PREFERENCE", meetingId, accessId: access.id, userId: member.id, email: access.email, updatedAt: new Date().toISOString() },
          ConditionExpression: preference.version ? "#version = :version" : "attribute_not_exists(pk)",
          ...(preference.version ? { ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": preference.version } } : {}),
        } },
        accessRecordGuard(access), ...auditItems,
      ] });
      return next;
    },
  };
}
export const meetingNotificationsRepository = createMeetingNotificationsRepository();
