import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { isAccountActive } from "@pgpz/core";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { SITE_URL } from "@/lib/config";
import { isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import { normalizeXHandle } from "@/lib/x-handle";
import {
  dispatchStagedBackgroundJob,
  prepareSingleRecipientBackgroundJob,
} from "@/lib/admin/background-jobs";
import { normalizePolicyInterestGroups } from "@/lib/policy-interest-groups";
import { claimEmailOwnershipTransactionItem } from "@/lib/email-ownership";

export type CreateInvitedMemberInput = {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  linkedinUrl?: string | null;
  xHandle?: string | null;
  memberDirectoryOptIn?: boolean;
  policyInterestGroups?: unknown;
  adminUserId?: string | null;
};

export class InvitationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InvitationError";
    this.status = status;
  }
}

const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` });
const invitationKey = (tokenHash: string) => ({
  pk: `INVITATION#${tokenHash}`,
  sk: `INVITATION#${tokenHash}`,
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeLinkedinUrl = (value: unknown) => {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    throw new InvitationError("LinkedIn URL must be http(s).");
  }

  return trimmed;
};

async function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: { ":pk": `USER#${normalized}`, ":sk": `USER#${normalized}` },
    Limit: 1,
  });

  return res.Items?.[0] || null;
}

function validateInvitedMember(input: CreateInvitedMemberInput) {
  const email = normalizeEmail(input.email);
  const firstName = normalizeText(input.firstName);
  const lastName = normalizeText(input.lastName);
  const company = normalizeText(input.company);
  const jobTitle = normalizeText(input.jobTitle);
  const linkedinUrl = normalizeLinkedinUrl(input.linkedinUrl);
  let xHandle = "";
  try {
    xHandle = normalizeXHandle(input.xHandle);
  } catch (err: any) {
    throw new InvitationError(err?.message || "Invalid X handle.");
  }

  if (!isValidEmail(email)) throw new InvitationError("Enter a valid email address.");
  if (!firstName) throw new InvitationError("First name is required.");
  if (!lastName) throw new InvitationError("Last name is required.");
  if (!company) throw new InvitationError("Corporate affiliation is required.");
  if (!jobTitle) throw new InvitationError("Job title is required.");
  if (company.length > 180) throw new InvitationError("Corporate affiliation must be 180 characters or fewer.");
  if (jobTitle.length > 180) throw new InvitationError("Job title must be 180 characters or fewer.");

  return {
    email,
    firstName,
    lastName,
    company,
    jobTitle,
    linkedinUrl,
    xHandle,
    memberDirectoryOptIn: input.memberDirectoryOptIn === true,
    policyInterestGroups: normalizePolicyInterestGroups(input.policyInterestGroups),
  };
}

export async function createInvitedMember(input: CreateInvitedMemberInput) {
  const values = validateInvitedMember(input);
  const existing = await findUserByEmail(values.email);
  if (existing?.id) {
    throw new InvitationError("A member with this email already exists.", 409);
  }

  const now = new Date().toISOString();
  const userId = randomUUID();
  const name = `${values.firstName} ${values.lastName}`.trim();

  const item = {
    ...userKey(userId),
    type: "USER",
    id: userId,
    name,
    email: values.email,
    emailVerified: null,
    image: null,
    firstName: values.firstName,
    lastName: values.lastName,
    company: values.company,
    jobTitle: values.jobTitle,
    linkedinUrl: values.linkedinUrl || null,
    xHandle: values.xHandle || null,
    memberDirectoryOptIn: values.memberDirectoryOptIn,
    policyInterestGroups: values.policyInterestGroups,
    membershipStatus: "invited",
    membershipProvider: "admin_invite",
    membershipVerifiedAt: null,
    invitationStatus: "pending",
    invitedAt: now,
    invitedBy: input.adminUserId || null,
    createdAt: now,
    updatedAt: now,
    GSI1PK: `USER#${values.email}`,
    GSI1SK: `USER#${values.email}`,
  };

  try {
    await documentClient.transactWrite({
      TransactItems: [
        claimEmailOwnershipTransactionItem({
          tableName: TABLE_NAME,
          email: values.email,
          appUserId: userId,
          now,
        }),
        {
          Put: {
            TableName: TABLE_NAME,
            Item: item,
            ConditionExpression: "attribute_not_exists(#pk)",
            ExpressionAttributeNames: { "#pk": "pk" },
          },
        },
      ],
    });
  } catch (error: any) {
    if (error?.name === "TransactionCanceledException") {
      throw new InvitationError("A member with this email already exists.", 409);
    }
    throw error;
  }

  return item;
}

export async function createInvitationActivationLink({
  userId,
  adminUserId,
  deliveryJobId,
}: {
  userId: string;
  adminUserId?: string | null;
  deliveryJobId?: string | null;
}) {
  const id = userId.trim();
  if (!id) throw new InvitationError("User ID is required.");

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(id),
    ProjectionExpression:
      "id, email, membershipStatus, invitationStatus, firstName, lastName, #name, accountStatus, deactivatedAt",
    ExpressionAttributeNames: { "#name": "name" },
  });
  if (!user.Item?.id) throw new InvitationError("Member not found.", 404);
  if (!isAccountActive(user.Item)) {
    throw new InvitationError("This account is deactivated.", 409);
  }
  if (user.Item.membershipStatus === "active") {
    throw new InvitationError("This member is already active.", 409);
  }
  if (user.Item.membershipStatus !== "invited") {
    throw new InvitationError("This member is not eligible for an invitation link.", 409);
  }

  const now = new Date().toISOString();
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const activationUrl = `${SITE_URL.replace(/\/+$/, "")}/api/invitations/activate?token=${encodeURIComponent(token)}`;

  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              ...invitationKey(tokenHash),
              type: "INVITATION_TOKEN",
              tokenHash,
              userId: id,
              email: typeof user.Item.email === "string" ? user.Item.email : null,
              createdAt: now,
              createdBy: adminUserId || null,
              expires,
            },
            ConditionExpression: "attribute_not_exists(#pk)",
            ExpressionAttributeNames: { "#pk": "pk" },
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: userKey(id),
            UpdateExpression:
              "SET invitationStatus = :pending, invitationTokenHash = :tokenHash, invitationTokenCreatedAt = :now, invitationTokenCreatedBy = :adminUserId, updatedAt = :now",
            ConditionExpression:
              `attribute_exists(#pk) AND #membershipStatus = :invited AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt)${deliveryJobId ? " AND #invitationEmailJobId = :deliveryJobId" : ""}`,
            ExpressionAttributeNames: {
              "#pk": "pk",
              "#membershipStatus": "membershipStatus",
              "#accountStatus": "accountStatus",
              "#deactivatedAt": "deactivatedAt",
              ...(deliveryJobId ? { "#invitationEmailJobId": "invitationEmailJobId" } : {}),
            },
            ExpressionAttributeValues: {
              ":pending": "pending",
              ":invited": "invited",
              ":deactivated": "deactivated",
              ":tokenHash": tokenHash,
              ":now": now,
              ":adminUserId": adminUserId || null,
              ...(deliveryJobId ? { ":deliveryJobId": deliveryJobId } : {}),
            },
          },
        },
      ],
    });
  } catch (error: any) {
    if (error?.name === "TransactionCanceledException") {
      throw new InvitationError("This member is no longer eligible for an invitation link.", 409);
    }
    throw error;
  }

  return {
    activationUrl,
    tokenHash,
    user: {
      id,
      email: typeof user.Item.email === "string" ? user.Item.email : null,
      name: typeof user.Item.name === "string" ? user.Item.name : null,
      firstName: typeof user.Item.firstName === "string" ? user.Item.firstName : null,
      lastName: typeof user.Item.lastName === "string" ? user.Item.lastName : null,
    },
  };
}

export async function claimInvitationEmailDelivery({
  userId,
  deliveryJobId,
}: {
  userId: string;
  deliveryJobId: string;
}) {
  const now = new Date().toISOString();
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression:
        "SET invitationEmailJobId = :deliveryJobId, invitationEmailClaimedAt = if_not_exists(invitationEmailClaimedAt, :now), updatedAt = :now",
      ConditionExpression:
        "attribute_exists(#pk) AND #membershipStatus = :invited AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt) AND attribute_not_exists(invitationEmailSentAt) AND (attribute_not_exists(emailSuppressed) OR emailSuppressed = :false) AND (attribute_not_exists(manualApprovalStatus) OR manualApprovalStatus <> :manualPending) AND (attribute_not_exists(invitationEmailJobId) OR invitationEmailJobId = :deliveryJobId)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#membershipStatus": "membershipStatus",
        "#accountStatus": "accountStatus",
        "#deactivatedAt": "deactivatedAt",
      },
      ExpressionAttributeValues: {
        ":deliveryJobId": deliveryJobId,
        ":now": now,
        ":invited": "invited",
        ":deactivated": "deactivated",
        ":false": false,
        ":manualPending": "pending",
      },
    });
    return true;
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

export async function releaseInvitationEmailDelivery({
  userId,
  deliveryJobId,
}: {
  userId: string;
  deliveryJobId: string;
}) {
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    UpdateExpression:
      "SET updatedAt = :now REMOVE invitationEmailJobId, invitationEmailClaimedAt",
    ConditionExpression:
      "invitationEmailJobId = :deliveryJobId AND attribute_not_exists(invitationEmailSentAt)",
    ExpressionAttributeValues: {
      ":deliveryJobId": deliveryJobId,
      ":now": new Date().toISOString(),
    },
  }).catch((error: any) => {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
  });
}

export async function markInvitationEmailSent({
  userId,
  adminUserId,
  deliveryJobId,
}: {
  userId: string;
  adminUserId?: string | null;
  deliveryJobId?: string | null;
}) {
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    UpdateExpression:
      `SET invitationEmailSentAt = if_not_exists(invitationEmailSentAt, :now), invitationEmailSentBy = if_not_exists(invitationEmailSentBy, :adminUserId), invitationStatus = :pending, membershipStatus = :invited, membershipProvider = :provider, updatedAt = :now${deliveryJobId ? ", invitationEmailSentJobId = :deliveryJobId" : ""}${deliveryJobId ? " REMOVE invitationEmailJobId, invitationEmailClaimedAt" : ""}`,
    ConditionExpression:
      `attribute_exists(#pk) AND #membershipStatus = :invited AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt)${deliveryJobId ? " AND (invitationEmailJobId = :deliveryJobId OR invitationEmailSentJobId = :deliveryJobId)" : ""}`,
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#membershipStatus": "membershipStatus",
      "#accountStatus": "accountStatus",
      "#deactivatedAt": "deactivatedAt",
    },
    ExpressionAttributeValues: {
      ":now": now,
      ":adminUserId": adminUserId || null,
      ":pending": "pending",
      ":invited": "invited",
      ":provider": "admin_invite",
      ...(deliveryJobId ? { ":deliveryJobId": deliveryJobId } : {}),
    },
  });
  return now;
}

export async function acceptAuthenticatedInvitation({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const id = userId.trim();
  const normalizedEmail = normalizeEmail(email);
  if (!id || !normalizedEmail) {
    throw new InvitationError("Sign in with the invited email address to accept this invitation.", 401);
  }

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(id),
    ProjectionExpression:
      "id, email, membershipStatus, invitationStatus, invitationTokenHash, accountStatus, deactivatedAt",
  });
  if (!user.Item?.id) throw new InvitationError("Member not found.", 404);
  if (!isAccountActive(user.Item)) {
    throw new InvitationError("This account is deactivated.", 409);
  }
  if (normalizeEmail(user.Item.email) !== normalizedEmail) {
    throw new InvitationError("Sign in with the email address that received this invitation.", 403);
  }
  if (user.Item.membershipStatus === "active") {
    return {
      ok: true,
      status: "already_active" as const,
      userId: id,
      email: normalizedEmail,
      activatedAt: null,
      communitySync: null,
    };
  }
  if (user.Item.membershipStatus !== "invited") {
    throw new InvitationError("This account does not have a pending invitation.", 409);
  }
  if (user.Item.invitationStatus !== "pending") {
    throw new InvitationError("This invitation is no longer available.", 409);
  }

  const now = new Date().toISOString();
  const invitationTokenHash = normalizeText(user.Item.invitationTokenHash);
  const communitySyncJob = await prepareSingleRecipientBackgroundJob({
    kind: "community_sync",
    mode: "live",
    sourceId: id,
    createdBy: id,
    idempotencyKey: `community-sync:invitation-acceptance:${id}:${randomUUID()}`,
    payload: { triggeredBy: "authenticated_invitation_acceptance" },
    recipients: [{ recipientKey: id, userId: id, email: normalizedEmail }],
  });
  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: userKey(id),
            UpdateExpression:
              "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :now, invitationStatus = :accepted, invitationAcceptedAt = :now, invitationAcceptedVia = :acceptedVia, updatedAt = :now, communitySyncStatus = :queued, communitySyncMessage = :syncMessage REMOVE invitationTokenHash, invitationTokenCreatedAt, invitationTokenCreatedBy, communitySyncError",
            ConditionExpression:
              "attribute_exists(#pk) AND #membershipStatus = :invited AND #invitationStatus = :pending AND #email = :email AND (attribute_not_exists(#accountStatus) OR #accountStatus <> :deactivated) AND attribute_not_exists(#deactivatedAt)",
            ExpressionAttributeNames: {
              "#pk": "pk",
              "#membershipStatus": "membershipStatus",
              "#invitationStatus": "invitationStatus",
              "#email": "email",
              "#accountStatus": "accountStatus",
              "#deactivatedAt": "deactivatedAt",
            },
            ExpressionAttributeValues: {
              ":active": "active",
              ":invited": "invited",
              ":provider": "admin_invite",
              ":accepted": "accepted",
              ":acceptedVia": "authenticated_session",
              ":email": normalizedEmail,
              ":deactivated": "deactivated",
              ":now": now,
              ":queued": "queued",
              ":syncMessage": "Community synchronization is queued.",
            },
          },
        },
        ...(invitationTokenHash
          ? [{ Delete: { TableName: TABLE_NAME, Key: invitationKey(invitationTokenHash) } }]
          : []),
        ...communitySyncJob.transactItems,
      ],
    });
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException" || err?.name === "TransactionCanceledException") {
      throw new InvitationError("This invitation is no longer available.", 409);
    }
    throw err;
  }

  await dispatchStagedBackgroundJob(communitySyncJob.job.id).catch((error) => {
    console.error("Community synchronization was staged but immediate dispatch failed", error);
  });

  return {
    ok: true,
    status: "activated" as const,
    userId: id,
    email: normalizedEmail,
    activatedAt: now,
    communitySync: {
      status: "queued" as const,
      jobId: communitySyncJob.job.id,
      message: "Community synchronization is queued.",
    },
  };
}

export async function inspectInvitationActivationToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) throw new InvitationError("Invitation token is required.", 400);

  const tokenHash = hashToken(trimmed);
  const tokenRecord = await documentClient.get({
    TableName: TABLE_NAME,
    Key: invitationKey(tokenHash),
  });
  const item = tokenRecord.Item as any;
  if (!item?.userId) throw new InvitationError("Invitation link not found.", 404);
  if (typeof item.expires === "number" && item.expires < Math.floor(Date.now() / 1000)) {
    throw new InvitationError("This invitation link has expired.", 410);
  }

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(String(item.userId)),
    ProjectionExpression:
      "id, email, membershipStatus, invitationStatus, invitationTokenHash, accountStatus, deactivatedAt",
  });
  const invitedUser = user.Item;
  if (!invitedUser?.id || !isAccountActive(invitedUser)) {
    throw new InvitationError("This invitation is no longer available.", 409);
  }
  if (
    invitedUser.membershipStatus !== "invited" ||
    invitedUser.invitationStatus !== "pending" ||
    normalizeEmail(invitedUser.email) !== normalizeEmail(item.email) ||
    (normalizeText(invitedUser.invitationTokenHash) && invitedUser.invitationTokenHash !== tokenHash)
  ) {
    throw new InvitationError("This invitation is no longer available.", 409);
  }

  return {
    status: "ready" as const,
    userId: String(item.userId),
  };
}
