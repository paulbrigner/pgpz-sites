import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { normalizeAccessApplicationStatus } from "@/lib/manual-approval";

export type MembershipStatus = "active" | "invited" | "none";

export class MembershipStatusError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MembershipStatusError";
    this.status = status;
  }
}

const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` });

export async function getUserMembershipStatus(userId: string) {
  if (!userId) throw new MembershipStatusError("Unauthorized", 401);

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    ProjectionExpression:
      "membershipStatus, membershipProvider, membershipVerifiedAt, manualApprovalStatus, manualApprovalRequestedAt, manualApprovalApprovedAt, applicationStatus, applicationRequestedAt, applicationApprovedAt, applicationDeclinedAt, applicationDeclineReason, applicationWithdrawnAt",
  });

  const item = res.Item || {};
  const membershipStatus =
    item.membershipStatus === "active" ? "active" : item.membershipStatus === "invited" ? "invited" : "none";
  const manualApprovalStatus =
    item.manualApprovalStatus === "pending" || item.manualApprovalStatus === "approved"
      ? item.manualApprovalStatus
      : item.manualApprovalStatus === "requested"
        ? "pending"
      : "none";

  return {
    membershipStatus: membershipStatus as MembershipStatus,
    membershipProvider: typeof item.membershipProvider === "string" ? item.membershipProvider : null,
    membershipVerifiedAt: typeof item.membershipVerifiedAt === "string" ? item.membershipVerifiedAt : null,
    manualApprovalStatus,
    manualApprovalRequestedAt:
      typeof item.manualApprovalRequestedAt === "string" ? item.manualApprovalRequestedAt : null,
    manualApprovalApprovedAt:
      typeof item.manualApprovalApprovedAt === "string" ? item.manualApprovalApprovedAt : null,
    applicationStatus: normalizeAccessApplicationStatus(item.applicationStatus, item.manualApprovalStatus),
    applicationRequestedAt:
      typeof item.applicationRequestedAt === "string"
        ? item.applicationRequestedAt
        : typeof item.manualApprovalRequestedAt === "string"
          ? item.manualApprovalRequestedAt
          : null,
    applicationApprovedAt:
      typeof item.applicationApprovedAt === "string"
        ? item.applicationApprovedAt
        : typeof item.manualApprovalApprovedAt === "string"
          ? item.manualApprovalApprovedAt
          : null,
    applicationDeclinedAt:
      typeof item.applicationDeclinedAt === "string" ? item.applicationDeclinedAt : null,
    applicationDeclineReason:
      typeof item.applicationDeclineReason === "string" ? item.applicationDeclineReason : null,
    applicationWithdrawnAt:
      typeof item.applicationWithdrawnAt === "string" ? item.applicationWithdrawnAt : null,
  };
}
