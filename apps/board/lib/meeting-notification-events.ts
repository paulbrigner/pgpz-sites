import "server-only";
import { randomUUID } from "node:crypto";
import contract from "@/config/meeting-notifications.json";
import { BOARD_MEETINGS_TABLE } from "@/lib/config";

/** Minimal transactional outbox. Never copy discussion, review or session content. */
export function meetingNotificationItems(input: {
  meetingId: string; action: string; actor: string; at: string; meetingDraft: boolean;
  ballotId?: string; ballotDraft?: boolean; reviewStarted?: boolean;
  sessionId?: string; replyId?: string; attachmentsChanged?: boolean; reviewChanged?: boolean;
}, tableName = BOARD_MEETINGS_TABLE): Record<string, unknown>[] {
  const mapped = (contract.actions as Record<string, string[]>)[input.action];
  if (!mapped) return [];
  const categories = [...mapped];
  if (input.attachmentsChanged) categories.push("materials");
  if (input.reviewChanged || (input.action === "written-consent-opened" && input.reviewStarted)) categories.push("reviews");
  const id = randomUUID();
  const item = {
    pk: `MEETING_NOTICE#${input.meetingId}`, sk: `EVENT#${id}`, entityType: "MEETING_NOTIFICATION_EVENT",
    id, ...input, categories, directorsOnly: input.action.startsWith("resolution-review-"),
  };
  return [{ Put: { TableName: tableName, Item: item, ConditionExpression: "attribute_not_exists(pk)" } }];
}
