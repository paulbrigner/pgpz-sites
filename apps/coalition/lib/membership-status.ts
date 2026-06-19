import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

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
      "membershipStatus, membershipProvider, membershipVerifiedAt, manualApprovalStatus, manualApprovalRequestedAt, manualApprovalApprovedAt",
  });

  const item = res.Item || {};
  const membershipStatus =
    item.membershipStatus === "active" ? "active" : item.membershipStatus === "invited" ? "invited" : "none";
  const manualApprovalStatus =
    item.manualApprovalStatus === "pending" || item.manualApprovalStatus === "approved"
      ? item.manualApprovalStatus
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
  };
}
