import "server-only";

import { randomUUID } from "node:crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { policyInterestGroupById, type PolicyInterestGroupId } from "@/lib/policy-interest-groups";

export type PolicyGroupWorkspaceItemKind = "note" | "task" | "link";
export type PolicyGroupWorkspaceItem = {
  id: string;
  groupId: PolicyInterestGroupId;
  kind: PolicyGroupWorkspaceItemKind;
  title: string;
  body: string;
  url: string | null;
  status: "open" | "completed";
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null;
};

export class PolicyGroupWorkspaceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PolicyGroupWorkspaceError";
    this.status = status;
  }
}

const groupKey = (groupId: string) => `POLICY_GROUP#${groupId}`;
const itemKey = (groupId: string, createdAt: string, id: string) => ({
  pk: groupKey(groupId),
  sk: `WORKSPACE_ITEM#${createdAt}#${id}`,
});

const requireGroup = (groupId: string) => {
  const group = policyInterestGroupById(groupId);
  if (!group) throw new PolicyGroupWorkspaceError("Policy group not found.", 404);
  return group.id;
};

const line = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const workspaceUrl = (value: unknown) => {
  const raw = line(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new PolicyGroupWorkspaceError("Workspace links must use http or https.");
  }
};

const toItem = (item: Record<string, any>): PolicyGroupWorkspaceItem => ({
  id: String(item.id),
  groupId: requireGroup(String(item.groupId)),
  kind: item.kind === "task" ? "task" : item.kind === "link" ? "link" : "note",
  title: String(item.title || ""),
  body: String(item.body || ""),
  url: typeof item.url === "string" ? item.url : null,
  status: item.status === "completed" ? "completed" : "open",
  authorId: String(item.authorId || ""),
  authorName: String(item.authorName || "Coalition member"),
  createdAt: String(item.createdAt || ""),
  updatedAt: String(item.updatedAt || item.createdAt || ""),
  completedAt: typeof item.completedAt === "string" ? item.completedAt : null,
  completedBy: typeof item.completedBy === "string" ? item.completedBy : null,
});

export async function listPolicyGroupWorkspaceItems(groupId: string) {
  const normalizedGroup = requireGroup(groupId);
  const items: PolicyGroupWorkspaceItem[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const result = await documentClient.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: {
        ":pk": groupKey(normalizedGroup),
        ":prefix": "WORKSPACE_ITEM#",
      },
      ScanIndexForward: false,
      ExclusiveStartKey,
    });
    for (const item of result.Items || []) items.push(toItem(item));
    ExclusiveStartKey = result.LastEvaluatedKey as Record<string, any> | undefined;
  } while (ExclusiveStartKey);
  return items;
}

export async function createPolicyGroupWorkspaceItem({
  groupId,
  kind,
  title,
  body,
  url,
  authorId,
  authorName,
}: {
  groupId: string;
  kind: unknown;
  title: unknown;
  body: unknown;
  url?: unknown;
  authorId: string;
  authorName: string;
}) {
  const normalizedGroup = requireGroup(groupId);
  const normalizedKind: PolicyGroupWorkspaceItemKind =
    kind === "task" ? "task" : kind === "link" ? "link" : "note";
  const normalizedTitle = line(title, 160);
  const normalizedBody = text(body, 6000);
  if (!normalizedTitle || !normalizedBody) {
    throw new PolicyGroupWorkspaceError("A title and details are required.");
  }
  const normalizedUrl = normalizedKind === "link" ? workspaceUrl(url) : null;
  if (normalizedKind === "link" && !normalizedUrl) {
    throw new PolicyGroupWorkspaceError("A valid link is required for link items.");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const item = {
    ...itemKey(normalizedGroup, now, id),
    type: "POLICY_GROUP_WORKSPACE_ITEM",
    id,
    groupId: normalizedGroup,
    kind: normalizedKind,
    title: normalizedTitle,
    body: normalizedBody,
    url: normalizedUrl,
    status: "open" as const,
    authorId,
    authorName: line(authorName, 160) || "Coalition member",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    completedBy: null,
  };
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
  });
  return toItem(item);
}

export async function setPolicyGroupTaskStatus({
  groupId,
  id,
  createdAt,
  completed,
  memberId,
}: {
  groupId: string;
  id: string;
  createdAt: string;
  completed: boolean;
  memberId: string;
}) {
  const normalizedGroup = requireGroup(groupId);
  const now = new Date().toISOString();
  try {
    const result = await documentClient.update({
      TableName: TABLE_NAME,
      Key: itemKey(normalizedGroup, createdAt, id),
      UpdateExpression: completed
        ? "SET #status = :completed, completedAt = :now, completedBy = :memberId, updatedAt = :now"
        : "SET #status = :open, updatedAt = :now REMOVE completedAt, completedBy",
      ConditionExpression: "attribute_exists(pk) AND #kind = :task",
      ExpressionAttributeNames: { "#status": "status", "#kind": "kind" },
      ExpressionAttributeValues: {
        ":task": "task",
        ":now": now,
        ...(completed
          ? { ":completed": "completed", ":memberId": memberId }
          : { ":open": "open" }),
      },
      ReturnValues: "ALL_NEW",
    });
    return toItem(result.Attributes || {});
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw new PolicyGroupWorkspaceError("Task not found.", 404);
    }
    throw error;
  }
}
