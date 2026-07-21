import "server-only";

import { isAccountActive } from "@pgpz/core";
import { queueAdminSignupNotification } from "@/lib/admin/signup-notifications";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type ManualApprovalStatus = "none" | "pending" | "approved";

export class ManualApprovalError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ManualApprovalError";
    this.status = status;
  }
}

const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` });

export async function requestManualApproval(userId: string) {
  if (!userId) throw new ManualApprovalError("Unauthorized", 401);

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    ProjectionExpression:
      "membershipStatus, manualApprovalStatus, manualApprovalRequestedAt, accountStatus, deactivatedAt",
  });

  if (!user.Item) throw new ManualApprovalError("User not found", 404);
  if (!isAccountActive(user.Item)) {
    throw new ManualApprovalError("This account is deactivated.", 409);
  }

  if (user.Item.membershipStatus === "active") {
    return {
      status: "already_active" as const,
      manualApprovalStatus: (user.Item.manualApprovalStatus as ManualApprovalStatus | undefined) || "none",
      manualApprovalRequestedAt: (user.Item.manualApprovalRequestedAt as string | undefined) || null,
    };
  }

  if (user.Item.manualApprovalStatus === "pending") {
    return {
      status: "pending" as const,
      manualApprovalStatus: "pending" as const,
      manualApprovalRequestedAt: (user.Item.manualApprovalRequestedAt as string | undefined) || null,
    };
  }

  const now = new Date().toISOString();
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression:
        "SET manualApprovalStatus = :pending, manualApprovalRequestedAt = if_not_exists(manualApprovalRequestedAt, :now), manualApprovalUpdatedAt = :now",
      ConditionExpression:
        "attribute_exists(#pk) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus = :none) AND (attribute_not_exists(#manualApprovalStatus) OR #manualApprovalStatus <> :pending) AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#membershipStatus": "membershipStatus",
        "#manualApprovalStatus": "manualApprovalStatus",
        "#accountStatus": "accountStatus",
        "#deactivatedAt": "deactivatedAt",
      },
      ExpressionAttributeValues: {
        ":pending": "pending",
        ":none": "none",
        ":deactivated": "deactivated",
        ":now": now,
      },
    });
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      const latest = await documentClient.get({
        TableName: TABLE_NAME,
        Key: userKey(userId),
        ProjectionExpression:
          "membershipStatus, manualApprovalStatus, manualApprovalRequestedAt, accountStatus, deactivatedAt",
        ConsistentRead: true,
      });

      if (
        latest.Item &&
        isAccountActive(latest.Item) &&
        latest.Item.membershipStatus !== "active" &&
        latest.Item.manualApprovalStatus === "pending"
      ) {
        return {
          status: "pending" as const,
          manualApprovalStatus: "pending" as const,
          manualApprovalRequestedAt:
            (latest.Item.manualApprovalRequestedAt as string | undefined) || null,
        };
      }

      throw new ManualApprovalError("This account is no longer eligible for manual approval.", 409);
    }
    throw err;
  }

  try {
    await queueAdminSignupNotification({
      type: "approval_requested",
      memberUserId: userId,
      occurredAt: now,
    });
  } catch (error) {
    console.error("Failed to dispatch admin approval-request notification", {
      memberUserId: userId,
      error,
    });
  }

  return {
    status: "requested" as const,
    manualApprovalStatus: "pending" as const,
    manualApprovalRequestedAt: now,
  };
}

export async function approveManualApproval({
  userId,
  adminUserId,
}: {
  userId: string;
  adminUserId: string | null;
}) {
  if (!userId) throw new ManualApprovalError("User ID is required.");

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    ProjectionExpression:
      "id, email, membershipStatus, manualApprovalStatus, accountStatus, deactivatedAt",
  });

  if (!user.Item?.id) throw new ManualApprovalError("User not found", 404);
  if (!isAccountActive(user.Item)) {
    throw new ManualApprovalError("This account is deactivated.", 409);
  }
  if (user.Item.membershipStatus === "active") {
    throw new ManualApprovalError("This member is already active.", 409);
  }

  const now = new Date().toISOString();
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression:
        "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :now, manualApprovalStatus = :approved, manualApprovalApprovedAt = :now, manualApprovalApprovedBy = :adminUserId, manualApprovalUpdatedAt = :now",
      ConditionExpression:
        "attribute_exists(#pk) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus = :none) AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#membershipStatus": "membershipStatus",
        "#accountStatus": "accountStatus",
        "#deactivatedAt": "deactivatedAt",
      },
      ExpressionAttributeValues: {
        ":active": "active",
        ":none": "none",
        ":deactivated": "deactivated",
        ":provider": "manual",
        ":now": now,
        ":approved": "approved",
        ":adminUserId": adminUserId,
      },
    });
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      throw new ManualApprovalError("This member is already active or no longer eligible for manual approval.", 409);
    }
    throw err;
  }

  return {
    ok: true,
    userId,
    email: (user.Item.email as string | undefined) || null,
    membershipStatus: "active" as const,
    membershipProvider: "manual" as const,
    membershipVerifiedAt: now,
    manualApprovalStatus: "approved" as const,
    manualApprovalApprovedAt: now,
  };
}
