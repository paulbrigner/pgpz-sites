import "server-only";

import { randomUUID } from "node:crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type ResourceSubmissionStatus = "pending" | "approved" | "rejected";

export type ResourceSubmission = {
  id: string;
  title: string;
  url: string | null;
  details: string;
  status: ResourceSubmissionStatus;
  submittedBy: string;
  submitterName: string;
  submitterEmail: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

export type ApprovedResourceListing = Pick<
  ResourceSubmission,
  "id" | "title" | "url" | "details"
>;

export class ResourceSubmissionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ResourceSubmissionError";
    this.status = status;
  }
}

const key = (id: string) => ({
  pk: `RESOURCE_SUBMISSION#${id}`,
  sk: `RESOURCE_SUBMISSION#${id}`,
});

const statusKey = (status: ResourceSubmissionStatus) =>
  `RESOURCE_SUBMISSION_STATUS#${status}`;

const sanitizeLine = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";

const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeUrl = (value: unknown) => {
  const url = sanitizeLine(value, 300);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw new ResourceSubmissionError("Resource link must be a valid http or https URL.");
  }
};

const toSubmission = (item: Record<string, any>): ResourceSubmission => ({
  id: String(item.id),
  title: String(item.title || ""),
  url: typeof item.url === "string" ? item.url : null,
  details: String(item.details || ""),
  status: item.status === "approved" ? "approved" : item.status === "rejected" ? "rejected" : "pending",
  submittedBy: String(item.submittedBy || ""),
  submitterName: String(item.submitterName || "Coalition member"),
  submitterEmail: typeof item.submitterEmail === "string" ? item.submitterEmail : null,
  submittedAt: String(item.submittedAt || ""),
  reviewedAt: typeof item.reviewedAt === "string" ? item.reviewedAt : null,
  reviewedBy: typeof item.reviewedBy === "string" ? item.reviewedBy : null,
  reviewNote: typeof item.reviewNote === "string" ? item.reviewNote : null,
});

export async function createResourceSubmission({
  title,
  url,
  details,
  submittedBy,
  submitterName,
  submitterEmail,
}: {
  title: unknown;
  url: unknown;
  details: unknown;
  submittedBy: string;
  submitterName: string;
  submitterEmail?: string | null;
}) {
  const normalizedTitle = sanitizeLine(title, 140);
  const normalizedDetails = sanitizeText(details, 4000);
  if (!normalizedTitle || !normalizedDetails) {
    throw new ResourceSubmissionError("Resource title and notes are required.");
  }
  const normalizedUrl = normalizeUrl(url);
  const id = randomUUID();
  const submittedAt = new Date().toISOString();
  const item = {
    ...key(id),
    type: "RESOURCE_SUBMISSION",
    id,
    title: normalizedTitle,
    url: normalizedUrl,
    details: normalizedDetails,
    status: "pending" as const,
    submittedBy,
    submitterName: sanitizeLine(submitterName, 160) || "Coalition member",
    submitterEmail: sanitizeLine(submitterEmail, 320) || null,
    submittedAt,
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    GSI1PK: statusKey("pending"),
    GSI1SK: `${submittedAt}#${id}`,
  };
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: "attribute_not_exists(pk)",
  });
  return toSubmission(item);
}

async function listByStatus(status: ResourceSubmissionStatus) {
  const items: ResourceSubmission[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const result = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
      ExpressionAttributeValues: { ":pk": statusKey(status) },
      ScanIndexForward: false,
      ExclusiveStartKey,
    });
    for (const item of result.Items || []) items.push(toSubmission(item));
    ExclusiveStartKey = result.LastEvaluatedKey as Record<string, any> | undefined;
  } while (ExclusiveStartKey);
  return items;
}

export async function listResourceSubmissions(status?: ResourceSubmissionStatus | "all") {
  if (status && status !== "all") return listByStatus(status);
  const results = await Promise.all([
    listByStatus("pending"),
    listByStatus("approved"),
    listByStatus("rejected"),
  ]);
  return results.flat().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function listApprovedResourceSubmissions() {
  return (await listByStatus("approved")).map(toApprovedResourceListing);
}

export function toApprovedResourceListing(
  submission: ApprovedResourceListing,
): ApprovedResourceListing {
  return {
    id: submission.id,
    title: submission.title,
    url: submission.url,
    details: submission.details,
  };
}

export async function reviewResourceSubmission({
  id,
  decision,
  adminUserId,
  note,
}: {
  id: string;
  decision: "approved" | "rejected";
  adminUserId: string;
  note?: unknown;
}) {
  const now = new Date().toISOString();
  const normalizedNote = sanitizeText(note, 2000) || null;
  try {
    const result = await documentClient.update({
      TableName: TABLE_NAME,
      Key: key(id),
      UpdateExpression:
        "SET #status = :decision, reviewedAt = :now, reviewedBy = :adminUserId, reviewNote = :note, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk",
      ConditionExpression: "attribute_exists(pk) AND #status = :pending",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":decision": decision,
        ":pending": "pending",
        ":now": now,
        ":adminUserId": adminUserId,
        ":note": normalizedNote,
        ":gsi1pk": statusKey(decision),
        ":gsi1sk": `${now}#${id}`,
      },
      ReturnValues: "ALL_NEW",
    });
    return toSubmission(result.Attributes || {});
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw new ResourceSubmissionError("This submission was already reviewed or no longer exists.", 409);
    }
    throw error;
  }
}
