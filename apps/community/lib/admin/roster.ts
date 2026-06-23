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
  emailSuppressedAt?: string | null;
  emailSuppressedReason?: string | null;
  emailSuppressedBy?: string | null;
  accountStatus?: "active" | "deactivated" | null;
  deactivatedAt?: string | null;
  deactivatedBy?: string | null;
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
  xHandle: string | null;
  linkedinUrl: string | null;
  membershipStatus: "active" | "none";
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  joinedAt: string | null;
  membershipProofPostUrl: string | null;
  membershipProofPostId: string | null;
  proofRetentionPolicy: string | null;
  manualApprovalStatus: "none" | "pending" | "approved";
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
  emailSuppressedAt: string | null;
  emailSuppressedReason: string | null;
  emailSuppressedBy: string | null;
  accountStatus: "active" | "deactivated";
  deactivatedAt: string | null;
  deactivatedBy: string | null;
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
  firstName: string | null;
  lastName: string | null;
};

export type AdminMemberProfileInput = {
  firstName: string;
  lastName: string;
  xHandle?: string | null;
  linkedinUrl?: string | null;
};

export type BuildAdminRosterOptions = {
  statusFilter?: "all" | "active" | "none" | "manual";
};

export class AdminMemberActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AdminMemberActionError";
    this.status = status;
  }
}

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const requireProfileText = (value: unknown, field: string) => {
  const trimmed = normalizeText(value);
  if (!trimmed) throw new Error(`${field} is required.`);
  if (trimmed.length > 180) throw new Error(`${field} must be 180 characters or fewer.`);
  return trimmed;
};

const normalizeCommunityXHandle = (value: unknown) => {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";
  const handle = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  if (handle.length > 50) throw new Error("X handle too long.");
  return handle;
};

const normalizeLinkedinUrl = (value: unknown) => {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    throw new Error("LinkedIn URL must be http(s).");
  }

  return trimmed;
};

const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` });

const confirmationTarget = (user: RawUser) => textOrNull(user.email) || textOrNull(user.id) || "";

const assertConfirmation = (confirmation: unknown, expected: string) => {
  if (typeof confirmation !== "string" || confirmation.trim() !== expected) {
    throw new AdminMemberActionError(`Type ${expected} to confirm.`, 400);
  }
};

async function getUserForAdminAction(userId: string) {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) throw new AdminMemberActionError("User ID is required.", 400);

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(trimmedUserId),
  });

  const user = res.Item as RawUser | undefined;
  if (!user?.id) throw new AdminMemberActionError("User not found.", 404);
  return user;
}

function assertNonAdminDestructiveTarget(user: RawUser, adminUserId: string | null) {
  if (user.id && adminUserId && user.id === adminUserId) {
    throw new AdminMemberActionError("You cannot perform this action on your own admin account.", 409);
  }
  if (user.isAdmin) {
    throw new AdminMemberActionError("Remove admin access before deactivating or deleting this user.", 409);
  }
}

async function scanUsers(): Promise<RawUser[]> {
  const items: RawUser[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.scan({
      TableName: TABLE_NAME,
      FilterExpression: "#type = :user",
      ProjectionExpression:
        "id, #name, email, firstName, lastName, xHandle, linkedinUrl, isAdmin, welcomeEmailSentAt, lastEmailSentAt, lastEmailType, emailBounceReason, emailSuppressed, emailSuppressedAt, emailSuppressedReason, emailSuppressedBy, accountStatus, deactivatedAt, deactivatedBy, membershipStatus, membershipProvider, membershipVerifiedAt, membershipProofPostUrl, membershipProofPostId, proofRetentionPolicy, manualApprovalStatus, manualApprovalRequestedAt, manualApprovalApprovedAt, manualApprovalApprovedBy, adminNotes, adminNotesUpdatedAt, adminNotesUpdatedBy",
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
  const accountStatus = user.accountStatus === "deactivated" || !!user.deactivatedAt ? "deactivated" : "active";

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
    joinedAt: textOrNull(user.membershipVerifiedAt),
    membershipProofPostUrl: textOrNull(user.membershipProofPostUrl),
    membershipProofPostId: textOrNull(user.membershipProofPostId),
    proofRetentionPolicy: textOrNull(user.proofRetentionPolicy),
    manualApprovalStatus,
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
    emailSuppressedAt: textOrNull(user.emailSuppressedAt),
    emailSuppressedReason: textOrNull(user.emailSuppressedReason),
    emailSuppressedBy: textOrNull(user.emailSuppressedBy),
    accountStatus,
    deactivatedAt: textOrNull(user.deactivatedAt),
    deactivatedBy: textOrNull(user.deactivatedBy),
  };
}

export async function updateAdminMemberProfile({
  userId,
  adminUserId,
  profile,
}: {
  userId: string;
  adminUserId: string | null;
  profile: AdminMemberProfileInput;
}) {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) throw new Error("User ID is required.");

  const firstName = requireProfileText(profile.firstName, "First name");
  const lastName = requireProfileText(profile.lastName, "Last name");
  const xHandle = normalizeCommunityXHandle(profile.xHandle);
  const linkedinUrl = normalizeLinkedinUrl(profile.linkedinUrl);
  const name = `${firstName} ${lastName}`.trim();
  const now = new Date().toISOString();

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${trimmedUserId}`, sk: `USER#${trimmedUserId}` },
    UpdateExpression:
      "SET firstName = :firstName, lastName = :lastName, #name = :name, xHandle = :xHandle, linkedinUrl = :linkedinUrl, updatedAt = :now, adminProfileUpdatedAt = :now, adminProfileUpdatedBy = :adminUserId",
    ConditionExpression: "attribute_exists(#pk)",
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#name": "name",
    },
    ExpressionAttributeValues: {
      ":firstName": firstName,
      ":lastName": lastName,
      ":name": name,
      ":xHandle": xHandle || null,
      ":linkedinUrl": linkedinUrl || null,
      ":now": now,
      ":adminUserId": adminUserId,
    },
  });

  return {
    ok: true,
    userId: trimmedUserId,
    name,
    firstName,
    lastName,
    xHandle: xHandle || null,
    linkedinUrl: linkedinUrl || null,
    adminProfileUpdatedAt: now,
    adminProfileUpdatedBy: adminUserId,
  };
}

export async function optOutAdminMemberEmail({
  userId,
  adminUserId,
  confirmation,
}: {
  userId: string;
  adminUserId: string | null;
  confirmation: string;
}) {
  const user = await getUserForAdminAction(userId);
  const target = confirmationTarget(user);
  if (!target) throw new AdminMemberActionError("User not found.", 404);
  assertConfirmation(confirmation, `OPT OUT ${target}`);

  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(user.id!),
    UpdateExpression:
      "SET emailSuppressed = :suppressed, emailSuppressedAt = :now, emailSuppressedReason = :reason, emailSuppressedBy = :adminUserId, updatedAt = :now",
    ExpressionAttributeValues: {
      ":suppressed": true,
      ":now": now,
      ":reason": "admin_opt_out",
      ":adminUserId": adminUserId,
    },
  });

  return {
    ok: true,
    userId: user.id!,
    emailSuppressed: true,
    emailSuppressedAt: now,
    emailSuppressedReason: "admin_opt_out",
    emailSuppressedBy: adminUserId,
  };
}

export async function deactivateAdminMember({
  userId,
  adminUserId,
  confirmation,
}: {
  userId: string;
  adminUserId: string | null;
  confirmation: string;
}) {
  const user = await getUserForAdminAction(userId);
  assertNonAdminDestructiveTarget(user, adminUserId);
  const target = confirmationTarget(user);
  if (!target) throw new AdminMemberActionError("User not found.", 404);
  assertConfirmation(confirmation, `DEACTIVATE ${target}`);

  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(user.id!),
    UpdateExpression:
      "SET accountStatus = :accountStatus, deactivatedAt = :now, deactivatedBy = :adminUserId, membershipStatus = :membershipStatus, emailSuppressed = :suppressed, emailSuppressedAt = :now, emailSuppressedReason = :reason, emailSuppressedBy = :adminUserId, updatedAt = :now",
    ExpressionAttributeValues: {
      ":accountStatus": "deactivated",
      ":now": now,
      ":adminUserId": adminUserId,
      ":membershipStatus": "none",
      ":suppressed": true,
      ":reason": "account_deactivated",
    },
  });

  return {
    ok: true,
    userId: user.id!,
    accountStatus: "deactivated" as const,
    deactivatedAt: now,
    deactivatedBy: adminUserId,
    membershipStatus: "none" as const,
    emailSuppressed: true,
    emailSuppressedAt: now,
    emailSuppressedReason: "account_deactivated",
    emailSuppressedBy: adminUserId,
  };
}

export async function deleteDeactivatedAdminMember({
  userId,
  adminUserId,
  confirmation,
}: {
  userId: string;
  adminUserId: string | null;
  confirmation: string;
}) {
  const user = await getUserForAdminAction(userId);
  assertNonAdminDestructiveTarget(user, adminUserId);
  const target = confirmationTarget(user);
  if (!target) throw new AdminMemberActionError("User not found.", 404);
  assertConfirmation(confirmation, `DELETE ${target}`);
  if (user.accountStatus !== "deactivated" && !user.deactivatedAt) {
    throw new AdminMemberActionError("Deactivate this user before deleting them.", 409);
  }

  const items: Array<{ pk: string; sk: string }> = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await documentClient.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "pk" },
      ExpressionAttributeValues: { ":pk": `USER#${user.id}` },
      ExclusiveStartKey,
    });
    for (const item of res.Items || []) {
      if (typeof item.pk === "string" && typeof item.sk === "string") {
        items.push({ pk: item.pk, sk: item.sk });
      }
    }
    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  for (let index = 0; index < items.length; index += 25) {
    await documentClient.batchWrite({
      RequestItems: {
        [TABLE_NAME]: items.slice(index, index + 25).map((key) => ({
          DeleteRequest: { Key: key },
        })),
      },
    });
  }

  return {
    ok: true,
    userId: user.id!,
    deletedItemCount: items.length,
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
  const key = { pk: `USER#${trimmedUserId}`, sk: `USER#${trimmedUserId}` };

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: key,
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
        return (
          member.accountStatus !== "deactivated" &&
          member.manualApprovalStatus === "pending" &&
          member.membershipStatus !== "active"
        );
      }
      return member.accountStatus !== "deactivated" && member.membershipStatus === statusFilter;
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
      active: allMembers.filter(
        (member) => member.accountStatus !== "deactivated" && member.membershipStatus === "active"
      ).length,
      none: allMembers.filter(
        (member) => member.accountStatus !== "deactivated" && member.membershipStatus === "none"
      ).length,
      manualPending: allMembers.filter(
        (member) =>
          member.accountStatus !== "deactivated" &&
          member.manualApprovalStatus === "pending" &&
          member.membershipStatus !== "active"
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
    .filter(
      (member) =>
        member.accountStatus !== "deactivated" &&
        member.membershipStatus === "active" &&
        !!member.email &&
        !member.emailSuppressed
    )
    .map((member) => ({
      id: member.id,
      email: member.email as string,
      name: getUserDisplayName(member),
      firstName: member.firstName,
      lastName: member.lastName,
    }))
    .sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: "base" }));
}
