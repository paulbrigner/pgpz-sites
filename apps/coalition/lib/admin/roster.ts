import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import { getUserDisplayName, textOrNull } from "@/lib/user-display-name";
import { normalizeXHandle } from "@/lib/x-handle";

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
  emailSuppressedAt?: string | null;
  emailSuppressedReason?: string | null;
  emailSuppressedBy?: string | null;
  accountStatus?: "active" | "deactivated" | null;
  deactivatedAt?: string | null;
  deactivatedBy?: string | null;
  membershipStatus?: MemberStatus | null;
  membershipProvider?: string | null;
  membershipVerifiedAt?: string | null;
  manualApprovalStatus?: ManualApprovalStatus | null;
  manualApprovalRequestedAt?: string | null;
  manualApprovalApprovedAt?: string | null;
  manualApprovalApprovedBy?: string | null;
  communitySyncStatus?: string | null;
  communitySyncAttemptedAt?: string | null;
  communitySyncedAt?: string | null;
  communitySyncMessage?: string | null;
  communitySyncError?: string | null;
  communityUserId?: string | null;
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
  joinedAt: string | null;
  invitationEmailSentAt: string | null;
  invitationAcceptedAt: string | null;
  invitationStatus: "pending" | "accepted" | null;
  manualApprovalStatus: ManualApprovalStatus;
  manualApprovalRequestedAt: string | null;
  manualApprovalApprovedAt: string | null;
  manualApprovalApprovedBy: string | null;
  communitySyncStatus: string | null;
  communitySyncAttemptedAt: string | null;
  communitySyncedAt: string | null;
  communitySyncMessage: string | null;
  communitySyncError: string | null;
  communityUserId: string | null;
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

export type AdminMemberProfileInput = {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  linkedinUrl?: string | null;
  xHandle?: string | null;
  memberDirectoryOptIn?: boolean;
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

async function findUserByEmail(email: string) {
  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: { ":pk": `USER#${email}`, ":sk": `USER#${email}` },
    Limit: 1,
  });
  return (res.Items?.[0] as RawUser | undefined) || null;
}

const assertConfirmation = (confirmation: unknown, expected: string) => {
  if (typeof confirmation !== "string" || confirmation.trim() !== expected) {
    throw new AdminMemberActionError(`Type ${expected} to confirm.`, 400);
  }
};

const assertAnyConfirmation = (confirmation: unknown, expected: string[]) => {
  const entered = typeof confirmation === "string" ? confirmation.trim() : "";
  if (!expected.includes(entered)) {
    throw new AdminMemberActionError(`Type ${expected[0]} to confirm.`, 400);
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
        "id, #name, email, firstName, lastName, company, jobTitle, linkedinUrl, xHandle, memberDirectoryOptIn, isAdmin, welcomeEmailSentAt, invitationEmailSentAt, invitationAcceptedAt, invitationStatus, lastEmailSentAt, lastEmailType, emailBounceReason, emailSuppressed, emailSuppressedAt, emailSuppressedReason, emailSuppressedBy, accountStatus, deactivatedAt, deactivatedBy, membershipStatus, membershipProvider, membershipVerifiedAt, manualApprovalStatus, manualApprovalRequestedAt, manualApprovalApprovedAt, manualApprovalApprovedBy, communitySyncStatus, communitySyncAttemptedAt, communitySyncedAt, communitySyncMessage, communitySyncError, communityUserId, adminNotes, adminNotesUpdatedAt, adminNotesUpdatedBy",
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
  const accountStatus = user.accountStatus === "deactivated" || !!user.deactivatedAt ? "deactivated" : "active";

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
    joinedAt: textOrNull(user.membershipVerifiedAt),
    invitationEmailSentAt: textOrNull(user.invitationEmailSentAt),
    invitationAcceptedAt: textOrNull(user.invitationAcceptedAt),
    invitationStatus: user.invitationStatus === "accepted" ? "accepted" : user.invitationStatus === "pending" ? "pending" : null,
    manualApprovalStatus: normalizeManualApprovalStatus(user.manualApprovalStatus),
    manualApprovalRequestedAt: textOrNull(user.manualApprovalRequestedAt),
    manualApprovalApprovedAt: textOrNull(user.manualApprovalApprovedAt),
    manualApprovalApprovedBy: textOrNull(user.manualApprovalApprovedBy),
    communitySyncStatus: textOrNull(user.communitySyncStatus),
    communitySyncAttemptedAt: textOrNull(user.communitySyncAttemptedAt),
    communitySyncedAt: textOrNull(user.communitySyncedAt),
    communitySyncMessage: textOrNull(user.communitySyncMessage),
    communitySyncError: textOrNull(user.communitySyncError),
    communityUserId: textOrNull(user.communityUserId),
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

  const user = await getUserForAdminAction(trimmedUserId);
  const email = normalizeEmail(profile.email);
  if (!email || !isValidEmail(email)) throw new Error("Invalid email address.");
  const emailChanged = normalizeEmail(user.email) !== email;
  if (emailChanged && adminUserId && user.id === adminUserId) {
    throw new AdminMemberActionError("Use Profile Settings to change your own admin email.", 409);
  }
  const existingEmailUser = await findUserByEmail(email);
  if (existingEmailUser?.id && existingEmailUser.id !== trimmedUserId) {
    throw new AdminMemberActionError("That email is already in use.", 409);
  }

  const firstName = requireProfileText(profile.firstName, "First name");
  const lastName = requireProfileText(profile.lastName, "Last name");
  const company = requireProfileText(profile.company, "Corporate affiliation");
  const jobTitle = requireProfileText(profile.jobTitle, "Job title");
  const linkedinUrl = normalizeLinkedinUrl(profile.linkedinUrl);
  const xHandle = normalizeXHandle(profile.xHandle);
  const memberDirectoryOptIn = profile.memberDirectoryOptIn === true;
  const name = `${firstName} ${lastName}`.trim();
  const now = new Date().toISOString();
  const emailAuditExpression = emailChanged
    ? ", adminEmailUpdatedAt = :now, adminEmailUpdatedBy = :adminUserId, previousEmail = :previousEmail"
    : "";

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${trimmedUserId}`, sk: `USER#${trimmedUserId}` },
    UpdateExpression:
      `SET email = :email, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk, firstName = :firstName, lastName = :lastName, company = :company, jobTitle = :jobTitle, #name = :name, linkedinUrl = :linkedinUrl, xHandle = :xHandle, memberDirectoryOptIn = :memberDirectoryOptIn, updatedAt = :now, adminProfileUpdatedAt = :now, adminProfileUpdatedBy = :adminUserId${emailAuditExpression}`,
    ConditionExpression: "attribute_exists(#pk)",
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#name": "name",
    },
    ExpressionAttributeValues: {
      ":email": email,
      ":gsi1pk": `USER#${email}`,
      ":gsi1sk": `USER#${email}`,
      ":firstName": firstName,
      ":lastName": lastName,
      ":company": company,
      ":jobTitle": jobTitle,
      ":name": name,
      ":linkedinUrl": linkedinUrl || null,
      ":xHandle": xHandle || null,
      ":memberDirectoryOptIn": memberDirectoryOptIn,
      ":now": now,
      ":adminUserId": adminUserId,
      ...(emailChanged ? { ":previousEmail": textOrNull(user.email) } : {}),
    },
  });

  return {
    ok: true,
    userId: trimmedUserId,
    email,
    name,
    firstName,
    lastName,
    company,
    jobTitle,
    linkedinUrl: linkedinUrl || null,
    xHandle: xHandle || null,
    memberDirectoryOptIn,
    adminProfileUpdatedAt: now,
    adminProfileUpdatedBy: adminUserId,
    ...(emailChanged
      ? {
          adminEmailUpdatedAt: now,
          adminEmailUpdatedBy: adminUserId,
          previousEmail: textOrNull(user.email),
        }
      : {}),
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
  assertAnyConfirmation(confirmation, ["DEACTIVATE", `DEACTIVATE ${target}`]);

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
      active: allMembers.filter(
        (member) => member.accountStatus !== "deactivated" && member.membershipStatus === "active"
      ).length,
      invited: allMembers.filter(
        (member) => member.accountStatus !== "deactivated" && member.membershipStatus === "invited"
      ).length,
      none: allMembers.filter(
        (member) => member.accountStatus !== "deactivated" && member.membershipStatus === "none"
      ).length,
      manualPending: allMembers.filter(
        (member) =>
          member.accountStatus !== "deactivated" &&
          member.manualApprovalStatus === "pending" &&
          member.membershipStatus !== "active",
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

export async function listActiveMemberDirectory(): Promise<MemberDirectoryEntry[]> {
  const rawUsers = await scanUsers();
  return rawUsers
    .map(toAdminMember)
    .filter((member): member is AdminMember => !!member)
    .filter(
      (member) =>
        member.accountStatus !== "deactivated" &&
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
