import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { getUserDisplayName, textOrNull } from "@/lib/user-display-name";

type RawUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  xHandle?: string | null;
  linkedinUrl?: string | null;
  isAdmin?: boolean | null;
  welcomeEmailSentAt?: string | null;
  lastEmailSentAt?: string | null;
  lastEmailType?: string | null;
  emailBounceReason?: string | null;
  emailSuppressed?: boolean | null;
  membershipStatus?: "active" | "none" | null;
  membershipProvider?: string | null;
  membershipVerifiedAt?: string | null;
  membershipProofPostUrl?: string | null;
  membershipProofPostId?: string | null;
  proofRetentionPolicy?: string | null;
  manualApprovalStatus?: "none" | "pending" | "approved" | null;
  manualApprovalRequestedAt?: string | null;
  manualApprovalApprovedAt?: string | null;
  manualApprovalApprovedBy?: string | null;
};

export type AdminMember = {
  id: string;
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  xHandle: string | null;
  linkedinUrl: string | null;
  membershipStatus: "active" | "none";
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  membershipProofPostUrl: string | null;
  membershipProofPostId: string | null;
  proofRetentionPolicy: string | null;
  manualApprovalStatus: "none" | "pending" | "approved";
  manualApprovalRequestedAt: string | null;
  manualApprovalApprovedAt: string | null;
  manualApprovalApprovedBy: string | null;
  isAdmin: boolean;
  welcomeEmailSentAt: string | null;
  lastEmailSentAt: string | null;
  lastEmailType: string | null;
  emailBounceReason: string | null;
  emailSuppressed: boolean | null;
};

export type AdminRoster = {
  members: AdminMember[];
  meta: {
    total: number;
    active: number;
    none: number;
    manualPending: number;
    admins: number;
  };
};

export type PolicyUpdateRecipient = {
  id: string;
  email: string;
  name: string | null;
};

export type BuildAdminRosterOptions = {
  statusFilter?: "all" | "active" | "none" | "manual";
};

async function scanUsers(): Promise<RawUser[]> {
  const items: RawUser[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.scan({
      TableName: TABLE_NAME,
      FilterExpression: "#type = :user",
      ProjectionExpression:
        "id, #name, email, firstName, lastName, xHandle, linkedinUrl, isAdmin, welcomeEmailSentAt, lastEmailSentAt, lastEmailType, emailBounceReason, emailSuppressed, membershipStatus, membershipProvider, membershipVerifiedAt, membershipProofPostUrl, membershipProofPostId, proofRetentionPolicy, manualApprovalStatus, manualApprovalRequestedAt, manualApprovalApprovedAt, manualApprovalApprovedBy",
      ExpressionAttributeNames: { "#type": "type", "#name": "name" },
      ExpressionAttributeValues: { ":user": "USER" },
      ExclusiveStartKey,
    });

    if (res.Items) {
      for (const item of res.Items) items.push(item as RawUser);
    }
    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return items;
}

function toAdminMember(user: RawUser): AdminMember | null {
  if (!user.id) return null;
  const membershipStatus = user.membershipStatus === "active" ? "active" : "none";
  const manualApprovalStatus =
    user.manualApprovalStatus === "pending" || user.manualApprovalStatus === "approved"
      ? user.manualApprovalStatus
      : "none";

  return {
    id: user.id,
    name: getUserDisplayName(user),
    email: textOrNull(user.email),
    firstName: textOrNull(user.firstName),
    lastName: textOrNull(user.lastName),
    xHandle: textOrNull(user.xHandle),
    linkedinUrl: textOrNull(user.linkedinUrl),
    membershipStatus,
    membershipProvider: textOrNull(user.membershipProvider),
    membershipVerifiedAt: textOrNull(user.membershipVerifiedAt),
    membershipProofPostUrl: textOrNull(user.membershipProofPostUrl),
    membershipProofPostId: textOrNull(user.membershipProofPostId),
    proofRetentionPolicy: textOrNull(user.proofRetentionPolicy),
    manualApprovalStatus,
    manualApprovalRequestedAt: textOrNull(user.manualApprovalRequestedAt),
    manualApprovalApprovedAt: textOrNull(user.manualApprovalApprovedAt),
    manualApprovalApprovedBy: textOrNull(user.manualApprovalApprovedBy),
    isAdmin: !!user.isAdmin,
    welcomeEmailSentAt: textOrNull(user.welcomeEmailSentAt),
    lastEmailSentAt: textOrNull(user.lastEmailSentAt),
    lastEmailType: textOrNull(user.lastEmailType),
    emailBounceReason: textOrNull(user.emailBounceReason),
    emailSuppressed: typeof user.emailSuppressed === "boolean" ? user.emailSuppressed : null,
  };
}

export async function buildAdminRoster(options: BuildAdminRosterOptions = {}): Promise<AdminRoster> {
  const statusFilter = options.statusFilter || "all";
  const rawUsers = await scanUsers();
  const allMembers = rawUsers
    .map(toAdminMember)
    .filter((member): member is AdminMember => !!member);
  const members = allMembers
    .filter((member) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "manual") {
        return member.manualApprovalStatus === "pending" && member.membershipStatus !== "active";
      }
      return member.membershipStatus === statusFilter;
    })
    .sort((a, b) => {
      if (statusFilter === "manual") {
        return (b.manualApprovalRequestedAt || "").localeCompare(a.manualApprovalRequestedAt || "");
      }
      const aName = a.lastName || a.name || a.email || "";
      const bName = b.lastName || b.name || b.email || "";
      return aName.localeCompare(bName, undefined, { sensitivity: "base" });
    });

  return {
    members,
    meta: {
      total: members.length,
      active: allMembers.filter((member) => member.membershipStatus === "active").length,
      none: allMembers.filter((member) => member.membershipStatus === "none").length,
      manualPending: allMembers.filter(
        (member) => member.manualApprovalStatus === "pending" && member.membershipStatus !== "active"
      ).length,
      admins: allMembers.filter((member) => member.isAdmin).length,
    },
  };
}

export async function listPolicyUpdateRecipients(): Promise<PolicyUpdateRecipient[]> {
  const rawUsers = await scanUsers();
  return rawUsers
    .map(toAdminMember)
    .filter((member): member is AdminMember => !!member)
    .filter((member) => member.membershipStatus === "active" && !!member.email && !member.emailSuppressed)
    .map((member) => ({
      id: member.id,
      email: member.email as string,
      name: getUserDisplayName(member),
    }))
    .sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: "base" }));
}
