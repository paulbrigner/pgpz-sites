import "server-only";

import { randomUUID } from "node:crypto";
import { isAccountActive } from "@pgpz/core";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  dispatchStagedBackgroundJob,
  prepareSingleRecipientBackgroundJob,
} from "@/lib/admin/background-jobs";

export type ManualApprovalStatus = "none" | "pending" | "approved";
export type AccessApplicationStatus = "none" | "requested" | "approved" | "declined" | "withdrawn";

export class ManualApprovalError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ManualApprovalError";
    this.status = status;
  }
}

const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` });

// Keep atomic writes aligned with @pgpz/core's isAccountActive predicate:
// legacy absent/null/empty statuses remain active, while any meaningful
// deactivation timestamp or unknown account status fails closed.
const ACTIVE_ACCOUNT_CONDITION =
  "(attribute_not_exists(#accountStatus) OR attribute_type(#accountStatus, :nullType) OR #accountStatus = :emptyString OR #accountStatus = :activeAccount) AND (attribute_not_exists(#deactivatedAt) OR attribute_type(#deactivatedAt, :nullType) OR #deactivatedAt = :emptyString)";

const activeAccountConditionValues = () => ({
  ":activeAccount": "active",
  ":emptyString": "",
  ":nullType": "NULL",
});

const APPROVAL_STATE_PROJECTION =
  "id, email, membershipStatus, manualApprovalStatus, manualApprovalRequestedAt, applicationStatus, accountStatus, deactivatedAt";

const normalizeManualApprovalStatus = (value: unknown): ManualApprovalStatus => {
  if (value === "pending" || value === "approved") return value;
  if (value === "requested") return "pending";
  return "none";
};

export const normalizeAccessApplicationStatus = (
  value: unknown,
  legacyStatus?: unknown,
): AccessApplicationStatus => {
  if (
    value === "requested" ||
    value === "approved" ||
    value === "declined" ||
    value === "withdrawn"
  ) return value;
  if (legacyStatus === "pending" || legacyStatus === "requested") return "requested";
  if (legacyStatus === "approved") return "approved";
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
      applicationStatus: "requested" as const,
    };
  }

  const now = new Date().toISOString();
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression:
        "SET manualApprovalStatus = :pending, manualApprovalRequestedAt = :now, manualApprovalUpdatedAt = :now, applicationStatus = :requested, applicationRequestedAt = :now, applicationUpdatedAt = :now REMOVE applicationApprovedAt, applicationApprovedBy, applicationDeclinedAt, applicationDeclinedBy, applicationDeclineReason, applicationWithdrawnAt",
      ConditionExpression:
        `attribute_exists(#pk) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus = :none) AND ${ACTIVE_ACCOUNT_CONDITION}`,
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#membershipStatus": "membershipStatus",
        "#accountStatus": "accountStatus",
        "#deactivatedAt": "deactivatedAt",
      },
      ExpressionAttributeValues: {
        ":pending": "pending",
        ":requested": "requested",
        ":none": "none",
        ":now": now,
        ...activeAccountConditionValues(),
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
    applicationStatus: "requested" as const,
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
    ProjectionExpression: APPROVAL_STATE_PROJECTION,
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
  const applicationStatus = normalizeAccessApplicationStatus(
    user.Item.applicationStatus,
    user.Item.manualApprovalStatus,
  );
  const approvalEligible = applicationStatus === "requested" && manualApprovalStatus !== "approved";

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
              "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :now, manualApprovalStatus = :approved, manualApprovalApprovedAt = :now, manualApprovalApprovedBy = :adminUserId, manualApprovalUpdatedAt = :now, applicationStatus = :approved, applicationApprovedAt = :now, applicationApprovedBy = :adminUserId, applicationUpdatedAt = :now, communitySyncStatus = :queued, communitySyncMessage = :syncMessage REMOVE invitationStatus, invitationTokenCreatedAt, invitationTokenCreatedBy, applicationDeclinedAt, applicationDeclinedBy, applicationDeclineReason, applicationWithdrawnAt, communitySyncError",
            ConditionExpression:
              `attribute_exists(#pk) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus <> :active) AND ${ACTIVE_ACCOUNT_CONDITION} AND (attribute_not_exists(#manualApprovalStatus) OR #manualApprovalStatus <> :approved) AND (applicationStatus = :requested OR #manualApprovalStatus = :pending)`,
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
              ":requested": "requested",
              ":now": now,
              ":approved": "approved",
              ":adminUserId": adminUserId,
              ":queued": "queued",
              ":syncMessage": "Community synchronization is queued.",
              ...activeAccountConditionValues(),
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
    if (err?.name === "TransactionCanceledException") {
      let latestUser: Record<string, unknown> | undefined;
      try {
        const latest = await documentClient.get({
          TableName: TABLE_NAME,
          Key: userKey(userId),
          ProjectionExpression: APPROVAL_STATE_PROJECTION,
          ConsistentRead: true,
        });
        latestUser = latest.Item;
      } catch {
        // Preserve the transaction failure if its conflict cannot be safely
        // classified from an authoritative account read.
        throw err;
      }

      if (!latestUser?.id) {
        throw new ManualApprovalError("This member is no longer eligible for approval.", 409);
      }
      if (latestUser.membershipStatus === "active") {
        throw new ManualApprovalError("This member is already active.", 409);
      }
      if (!isAccountActive(latestUser)) {
        throw new ManualApprovalError("This account is deactivated.", 409);
      }

      const latestMembershipStatus = latestUser.membershipStatus === "invited" ? "invited" : "none";
      const latestManualStatus = normalizeManualApprovalStatus(latestUser.manualApprovalStatus);
      const latestApplicationStatus = normalizeAccessApplicationStatus(
        latestUser.applicationStatus,
        latestUser.manualApprovalStatus,
      );
      if (latestApplicationStatus !== "requested" || latestManualStatus === "approved") {
        throw new ManualApprovalError(
          latestMembershipStatus === "invited"
            ? "This member is in the invitation flow. They must sign in and accept the invitation."
            : "This member is not eligible for approval.",
          409,
        );
      }

      if (err?.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") {
        throw new ManualApprovalError("This member is no longer eligible for approval.", 409);
      }
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
    applicationStatus: "approved" as const,
    communitySync: {
      status: "queued" as const,
      jobId: communitySyncJob.job.id,
      message: "Community synchronization is queued.",
    },
  };
}

export async function declineAccessApplication({
  userId,
  adminUserId,
  reason,
}: {
  userId: string;
  adminUserId: string | null;
  reason?: string | null;
}) {
  if (!userId) throw new ManualApprovalError("User ID is required.");
  const now = new Date().toISOString();
  const normalizedReason = typeof reason === "string" ? reason.trim().slice(0, 1000) : "";
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression:
        "SET applicationStatus = :declined, applicationDeclinedAt = :now, applicationDeclinedBy = :adminUserId, applicationDeclineReason = :reason, applicationUpdatedAt = :now, manualApprovalStatus = :none, manualApprovalUpdatedAt = :now",
      ConditionExpression:
        `attribute_exists(#pk) AND (applicationStatus = :requested OR manualApprovalStatus = :pending) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus = :none) AND ${ACTIVE_ACCOUNT_CONDITION}`,
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#membershipStatus": "membershipStatus",
        "#accountStatus": "accountStatus",
        "#deactivatedAt": "deactivatedAt",
      },
      ExpressionAttributeValues: {
        ":declined": "declined",
        ":requested": "requested",
        ":pending": "pending",
        ":none": "none",
        ":now": now,
        ":adminUserId": adminUserId,
        ":reason": normalizedReason || null,
        ...activeAccountConditionValues(),
      },
    });
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw new ManualApprovalError("This application is no longer awaiting a decision.", 409);
    }
    throw error;
  }
  return { ok: true, userId, applicationStatus: "declined" as const, applicationDeclinedAt: now };
}

export async function withdrawAccessApplication(userId: string) {
  if (!userId) throw new ManualApprovalError("Unauthorized", 401);
  const now = new Date().toISOString();
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression:
        "SET applicationStatus = :withdrawn, applicationWithdrawnAt = :now, applicationUpdatedAt = :now, manualApprovalStatus = :none, manualApprovalUpdatedAt = :now",
      ConditionExpression:
        `attribute_exists(#pk) AND (applicationStatus = :requested OR manualApprovalStatus = :pending) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus = :none) AND ${ACTIVE_ACCOUNT_CONDITION}`,
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#membershipStatus": "membershipStatus",
        "#accountStatus": "accountStatus",
        "#deactivatedAt": "deactivatedAt",
      },
      ExpressionAttributeValues: {
        ":withdrawn": "withdrawn",
        ":requested": "requested",
        ":pending": "pending",
        ":none": "none",
        ":now": now,
        ...activeAccountConditionValues(),
      },
    });
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw new ManualApprovalError("This application is no longer pending.", 409);
    }
    throw error;
  }
  return { ok: true, applicationStatus: "withdrawn" as const, applicationWithdrawnAt: now };
}
