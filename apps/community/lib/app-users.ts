import "server-only";

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { getUserDisplayName } from "@/lib/user-display-name";

type RawAppUser = Record<string, any> & {
  id?: string;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const userKey = (userId: string) => ({
  pk: `USER#${userId}`,
  sk: `USER#${userId}`,
});

export async function findAppUserByEmail(email: string): Promise<RawAppUser | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: {
      ":pk": `USER#${normalizedEmail}`,
      ":sk": `USER#${normalizedEmail}`,
    },
    Limit: 1,
  });

  return (res.Items?.[0] as RawAppUser | undefined) || null;
}

export async function getAppUserById(userId: string): Promise<RawAppUser | null> {
  const trimmedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!trimmedUserId) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(trimmedUserId),
  });

  return (res.Item as RawAppUser | undefined) || null;
}

export async function updateAppUserEmail(userId: string, email: string): Promise<RawAppUser | null> {
  const trimmedUserId = typeof userId === "string" ? userId.trim() : "";
  const normalizedEmail = normalizeEmail(email);
  if (!trimmedUserId || !normalizedEmail) return null;

  try {
    const res = await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(trimmedUserId),
      UpdateExpression:
        "SET email = :email, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk, updatedAt = :updatedAt",
      ConditionExpression: "attribute_exists(#pk)",
      ExpressionAttributeNames: { "#pk": "pk" },
      ExpressionAttributeValues: {
        ":email": normalizedEmail,
        ":gsi1pk": `USER#${normalizedEmail}`,
        ":gsi1sk": `USER#${normalizedEmail}`,
        ":updatedAt": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    });
    return (res.Attributes as RawAppUser | undefined) || null;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException || (err as any)?.name === "ConditionalCheckFailedException") {
      return null;
    }
    throw err;
  }
}

export async function ensureAppUserForEmail({
  email,
  preferredUserId,
  name,
}: {
  email: string;
  preferredUserId: string;
  name?: string | null;
}): Promise<RawAppUser> {
  const normalizedEmail = normalizeEmail(email);
  const userId = preferredUserId.trim();
  if (!normalizedEmail || !userId) {
    throw new Error("Cannot create an app user without an email and user id.");
  }

  const existing = await findAppUserByEmail(normalizedEmail);
  if (existing?.id) return existing;

  const now = new Date().toISOString();
  const displayName = typeof name === "string" && name.trim() ? name.trim() : normalizedEmail;
  const item: RawAppUser = {
    ...userKey(userId),
    type: "USER",
    id: userId,
    email: normalizedEmail,
    name: displayName,
    emailVerified: now,
    membershipStatus: "none",
    manualApprovalStatus: "none",
    accountStatus: "active",
    createdAt: now,
    updatedAt: now,
    GSI1PK: `USER#${normalizedEmail}`,
    GSI1SK: `USER#${normalizedEmail}`,
  };

  try {
    await documentClient.put({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(#pk)",
      ExpressionAttributeNames: { "#pk": "pk" },
    });
    return item;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException || (err as any)?.name === "ConditionalCheckFailedException") {
      const byEmail = await findAppUserByEmail(normalizedEmail);
      if (byEmail?.id) return byEmail;
      const byId = await getAppUserById(userId);
      if (byId?.id) return byId;
    }
    throw err;
  }
}

export function appSessionUserFromRecord(user: RawAppUser) {
  const email = normalizeEmail(user.email);
  const firstName = typeof user.firstName === "string" ? user.firstName : null;
  const lastName = typeof user.lastName === "string" ? user.lastName : null;

  return {
    id: user.id || null,
    email: email || null,
    name: getUserDisplayName(user),
    firstName,
    lastName,
    xHandle: typeof user.xHandle === "string" ? user.xHandle : null,
    linkedinUrl: typeof user.linkedinUrl === "string" ? user.linkedinUrl : null,
    isAdmin: user.isAdmin === true,
    welcomeEmailSentAt: typeof user.welcomeEmailSentAt === "string" ? user.welcomeEmailSentAt : null,
    lastEmailSentAt: typeof user.lastEmailSentAt === "string" ? user.lastEmailSentAt : null,
    lastEmailType: typeof user.lastEmailType === "string" ? user.lastEmailType : null,
    emailBounceReason: typeof user.emailBounceReason === "string" ? user.emailBounceReason : null,
    emailSuppressed: typeof user.emailSuppressed === "boolean" ? user.emailSuppressed : null,
    membershipStatus: user.membershipStatus === "active" ? "active" : "none",
    membershipProvider: typeof user.membershipProvider === "string" ? user.membershipProvider : null,
    membershipVerifiedAt: typeof user.membershipVerifiedAt === "string" ? user.membershipVerifiedAt : null,
    membershipProofPostUrl:
      typeof user.membershipProofPostUrl === "string" ? user.membershipProofPostUrl : null,
    membershipProofPostId:
      typeof user.membershipProofPostId === "string" ? user.membershipProofPostId : null,
    proofRetentionPolicy:
      typeof user.proofRetentionPolicy === "string" ? user.proofRetentionPolicy : null,
    manualApprovalStatus:
      user.manualApprovalStatus === "pending" || user.manualApprovalStatus === "approved"
        ? user.manualApprovalStatus
        : "none",
    manualApprovalRequestedAt:
      typeof user.manualApprovalRequestedAt === "string" ? user.manualApprovalRequestedAt : null,
    manualApprovalApprovedAt:
      typeof user.manualApprovalApprovedAt === "string" ? user.manualApprovalApprovedAt : null,
    accountStatus:
      user.accountStatus === "deactivated" || user.deactivatedAt ? "deactivated" : "active",
  };
}
