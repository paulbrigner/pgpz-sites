import "server-only";

import { randomUUID } from "node:crypto";
import { isAccountActive } from "@pgpz/core";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  dispatchStagedBackgroundJob,
  prepareSingleRecipientBackgroundJob,
} from "@/lib/admin/background-jobs";

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

const normalizeManualApprovalStatus = (value: unknown): ManualApprovalStatus => {
  if (value === "pending" || value === "approved") return value;
  if (value === "requested") return "pending";
  return "none";
};

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

  if (user.Item.membershipStatus === "invited") {
    throw new ManualApprovalError("This account is invited. Sign in and accept the invitation to activate membership.", 409);
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
        "attribute_exists(#pk) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus = :none) AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#membershipStatus": "membershipStatus",
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
      throw new ManualApprovalError("This account is no longer eligible for manual approval.", 409);
    }
    throw err;
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
      "id, email, membershipStatus, manualApprovalStatus, manualApprovalRequestedAt, accountStatus, deactivatedAt",
  });

  if (!user.Item?.id) throw new ManualApprovalError("User not found", 404);
  if (user.Item.membershipStatus === "active") {
    throw new ManualApprovalError("This member is already active.", 409);
  }
  if (!isAccountActive(user.Item)) {
    throw new ManualApprovalError("This account is deactivated.", 409);
  }

  const membershipStatus = user.Item.membershipStatus === "invited" ? "invited" : "none";
  const manualApprovalStatus = normalizeManualApprovalStatus(user.Item.manualApprovalStatus);
  const approvalEligible =
    manualApprovalStatus === "pending" || (membershipStatus === "none" && manualApprovalStatus !== "approved");

  if (!approvalEligible) {
    throw new ManualApprovalError(
      membershipStatus === "invited"
        ? "This member is in the invitation flow. They must sign in and accept the invitation."
        : "This member is not eligible for approval.",
      409,
    );
  }

  const now = new Date().toISOString();
  const communitySyncJob = await prepareSingleRecipientBackgroundJob({
    kind: "community_sync",
    mode: "live",
    sourceId: userId,
    createdBy: adminUserId,
    idempotencyKey: `community-sync:manual-approval:${userId}:${randomUUID()}`,
    payload: { triggeredBy: "manual_approval" },
    recipients: [{
      recipientKey: userId,
      userId,
      email: (user.Item.email as string | undefined) || null,
    }],
  });
  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: userKey(userId),
            UpdateExpression:
              "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :now, manualApprovalStatus = :approved, manualApprovalApprovedAt = :now, manualApprovalApprovedBy = :adminUserId, manualApprovalUpdatedAt = :now, communitySyncStatus = :queued, communitySyncMessage = :syncMessage REMOVE invitationStatus, invitationTokenCreatedAt, invitationTokenCreatedBy, communitySyncError",
            ConditionExpression:
              "attribute_exists(#pk) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus <> :active) AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt) AND (attribute_not_exists(#manualApprovalStatus) OR #manualApprovalStatus <> :approved) AND (#manualApprovalStatus = :pending OR attribute_not_exists(#membershipStatus) OR #membershipStatus = :none)",
            ExpressionAttributeNames: {
              "#pk": "pk",
              "#membershipStatus": "membershipStatus",
              "#manualApprovalStatus": "manualApprovalStatus",
              "#accountStatus": "accountStatus",
              "#deactivatedAt": "deactivatedAt",
            },
            ExpressionAttributeValues: {
              ":active": "active",
              ":provider": "manual",
              ":pending": "pending",
              ":none": "none",
              ":deactivated": "deactivated",
              ":now": now,
              ":approved": "approved",
              ":adminUserId": adminUserId,
              ":queued": "queued",
              ":syncMessage": "Community synchronization is queued.",
            },
          },
        },
        ...communitySyncJob.transactItems,
      ],
    });
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      throw new ManualApprovalError("This member is no longer eligible for approval.", 409);
    }
    throw err;
  }

  await dispatchStagedBackgroundJob(communitySyncJob.job.id).catch((error) => {
    console.error("Community synchronization was staged but immediate dispatch failed", error);
  });

  return {
    ok: true,
    userId,
    email: (user.Item.email as string | undefined) || null,
    membershipStatus: "active" as const,
    membershipProvider: "manual" as const,
    membershipVerifiedAt: now,
    manualApprovalStatus: "approved" as const,
    manualApprovalApprovedAt: now,
    communitySync: {
      status: "queued" as const,
      jobId: communitySyncJob.job.id,
      message: "Community synchronization is queued.",
    },
  };
}
