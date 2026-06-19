import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { getUserDisplayName, textOrNull } from "@/lib/user-display-name";

export type MemberStatus = "active" | "invited" | "none";
export type ManualApprovalStatus = "none" | "pending" | "approved";

type RawUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  linkedinUrl?: string | null;
  xHandle?: string | null;
  memberDirectoryOptIn?: boolean | null;
  isAdmin?: boolean | null;
  welcomeEmailSentAt?: string | null;
  invitationEmailSentAt?: string | null;
  invitationAcceptedAt?: string | null;
  invitationStatus?: "pending" | "accepted" | null;
  lastEmailSentAt?: string | null;
  lastEmailType?: string | null;
  emailBounceReason?: string | null;
  emailSuppressed?: boolean | null;
  membershipStatus?: MemberStatus | null;
  membershipProvider?: string | null;
  membershipVerifiedAt?: string | null;
  manualApprovalStatus?: ManualApprovalStatus | null;
  manualApprovalRequestedAt?: string | null;
  manualApprovalApprovedAt?: string | null;
  manualApprovalApprovedBy?: string | null;
  adminNotes?: string | null;
  adminNotesUpdatedAt?: string | null;
  adminNotesUpdatedBy?: string | null;
};

export type AdminMember = {
  id: string;
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
  memberDirectoryOptIn: boolean;
  membershipStatus: MemberStatus;
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  invitationEmailSentAt: string | null;
  invitationAcceptedAt: string | null;
  invitationStatus: "pending" | "accepted" | null;
  manualApprovalStatus: ManualApprovalStatus;
  manualApprovalRequestedAt: string | null;
  manualApprovalApprovedAt: string | null;
  manualApprovalApprovedBy: string | null;
  adminNotes: string | null;
  adminNotesUpdatedAt: string | null;
  adminNotesUpdatedBy: string | null;
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
    invited: number;
    none: number;
    manualPending: number;
    admins: number;
  };
};

export type PolicyUpdateRecipient = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type MemberDirectoryEntry = {
  id: string;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
};

export type BuildAdminRosterOptions = {
  statusFilter?: "all" | "active" | "invited" | "none" | "manual";
};

async function scanUsers(): Promise<RawUser[]> {
  const items: RawUser[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.scan({
      TableName: TABLE_NAME,
      FilterExpression: "#type = :user",
      ProjectionExpression:
        "id, #name, email, firstName, lastName, company, jobTitle, linkedinUrl, xHandle, memberDirectoryOptIn, isAdmin, welcomeEmailSentAt, invitationEmailSentAt, invitationAcceptedAt, invitationStatus, lastEmailSentAt, lastEmailType, emailBounceReason, emailSuppressed, membershipStatus, membershipProvider, membershipVerifiedAt, manualApprovalStatus, manualApprovalRequestedAt, manualApprovalApprovedAt, manualApprovalApprovedBy, adminNotes, adminNotesUpdatedAt, adminNotesUpdatedBy",
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

function normalizeMembershipStatus(value: unknown): MemberStatus {
  if (value === "active" || value === "invited") return value;
  return "none";
}

function normalizeManualApprovalStatus(value: unknown): ManualApprovalStatus {
  if (value === "pending" || value === "approved") return value;
  return "none";
}

function toAdminMember(user: RawUser): AdminMember | null {
  if (!user.id) return null;

  return {
    id: user.id,
    name: getUserDisplayName(user),
    email: textOrNull(user.email),
    firstName: textOrNull(user.firstName),
    lastName: textOrNull(user.lastName),
    company: textOrNull(user.company),
    jobTitle: textOrNull(user.jobTitle),
    linkedinUrl: textOrNull(user.linkedinUrl),
    xHandle: textOrNull(user.xHandle),
    memberDirectoryOptIn: user.memberDirectoryOptIn === true,
    membershipStatus: normalizeMembershipStatus(user.membershipStatus),
    membershipProvider: textOrNull(user.membershipProvider),
    membershipVerifiedAt: textOrNull(user.membershipVerifiedAt),
    invitationEmailSentAt: textOrNull(user.invitationEmailSentAt),
    invitationAcceptedAt: textOrNull(user.invitationAcceptedAt),
    invitationStatus: user.invitationStatus === "accepted" ? "accepted" : user.invitationStatus === "pending" ? "pending" : null,
    manualApprovalStatus: normalizeManualApprovalStatus(user.manualApprovalStatus),
    manualApprovalRequestedAt: textOrNull(user.manualApprovalRequestedAt),
    manualApprovalApprovedAt: textOrNull(user.manualApprovalApprovedAt),
    manualApprovalApprovedBy: textOrNull(user.manualApprovalApprovedBy),
    adminNotes: textOrNull(user.adminNotes),
    adminNotesUpdatedAt: textOrNull(user.adminNotesUpdatedAt),
    adminNotesUpdatedBy: textOrNull(user.adminNotesUpdatedBy),
    isAdmin: !!user.isAdmin,
    welcomeEmailSentAt: textOrNull(user.welcomeEmailSentAt),
    lastEmailSentAt: textOrNull(user.lastEmailSentAt),
    lastEmailType: textOrNull(user.lastEmailType),
    emailBounceReason: textOrNull(user.emailBounceReason),
    emailSuppressed: typeof user.emailSuppressed === "boolean" ? user.emailSuppressed : null,
  };
}

export async function updateAdminMemberNotes({
  userId,
  adminUserId,
  adminNotes,
}: {
  userId: string;
  adminUserId: string | null;
  adminNotes: string;
}) {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) throw new Error("User ID is required.");
  if (adminNotes.length > 4000) throw new Error("Admin notes must be 4,000 characters or fewer.");

  const now = new Date().toISOString();
  const normalizedNotes = adminNotes.trim();

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${trimmedUserId}`, sk: `USER#${trimmedUserId}` },
    UpdateExpression: normalizedNotes
      ? "SET adminNotes = :notes, adminNotesUpdatedAt = :now, adminNotesUpdatedBy = :adminUserId"
      : "SET adminNotesUpdatedAt = :now, adminNotesUpdatedBy = :adminUserId REMOVE adminNotes",
    ConditionExpression: "attribute_exists(#pk)",
    ExpressionAttributeNames: {
      "#pk": "pk",
    },
    ExpressionAttributeValues: normalizedNotes
      ? {
          ":notes": normalizedNotes,
          ":now": now,
          ":adminUserId": adminUserId,
        }
      : {
          ":now": now,
          ":adminUserId": adminUserId,
        },
  });

  return {
    ok: true,
    userId: trimmedUserId,
    adminNotes: normalizedNotes || null,
    adminNotesUpdatedAt: now,
    adminNotesUpdatedBy: adminUserId,
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
      if (statusFilter === "invited") {
        return (b.invitationEmailSentAt || "").localeCompare(a.invitationEmailSentAt || "");
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
      invited: allMembers.filter((member) => member.membershipStatus === "invited").length,
      none: allMembers.filter((member) => member.membershipStatus === "none").length,
      manualPending: allMembers.filter(
        (member) => member.manualApprovalStatus === "pending" && member.membershipStatus !== "active",
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
      firstName: member.firstName,
      lastName: member.lastName,
    }))
    .sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: "base" }));
}

export async function listActiveMemberDirectory(): Promise<MemberDirectoryEntry[]> {
  const rawUsers = await scanUsers();
  return rawUsers
    .map(toAdminMember)
    .filter((member): member is AdminMember => !!member)
    .filter(
      (member) =>
        member.membershipStatus === "active" &&
        member.memberDirectoryOptIn &&
        !!member.email,
    )
    .map((member) => ({
      id: member.id,
      name: getUserDisplayName(member) || member.email || "Coalition member",
      email: member.email as string,
      firstName: member.firstName,
      lastName: member.lastName,
      company: member.company,
      jobTitle: member.jobTitle,
      linkedinUrl: member.linkedinUrl,
      xHandle: member.xHandle,
    }))
    .sort((a, b) => {
      const companyCompare = (a.company || "").localeCompare(b.company || "", undefined, {
        sensitivity: "base",
      });
      if (companyCompare) return companyCompare;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}
