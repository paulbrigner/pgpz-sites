import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { SITE_URL } from "@/lib/config";
import { isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import { normalizeXHandle } from "@/lib/x-handle";
import { syncCoalitionMemberToCommunityById } from "@/lib/community-sync";
import { normalizePolicyInterestGroups } from "@/lib/policy-interest-groups";

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

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: "attribute_not_exists(#pk)",
    ExpressionAttributeNames: { "#pk": "pk" },
  });

  return item;
}

export async function createInvitationActivationLink({
  userId,
  adminUserId,
}: {
  userId: string;
  adminUserId?: string | null;
}) {
  const id = userId.trim();
  if (!id) throw new InvitationError("User ID is required.");

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(id),
    ProjectionExpression:
      "id, email, membershipStatus, invitationStatus, firstName, lastName, #name",
    ExpressionAttributeNames: { "#name": "name" },
  });
  if (!user.Item?.id) throw new InvitationError("Member not found.", 404);
  if (user.Item.membershipStatus === "active") {
    throw new InvitationError("This member is already active.", 409);
  }

  const now = new Date().toISOString();
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const activationUrl = `${SITE_URL.replace(/\/+$/, "")}/api/invitations/activate?token=${encodeURIComponent(token)}`;

  await documentClient.put({
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
  });

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(id),
    UpdateExpression:
      "SET invitationStatus = :pending, invitationTokenCreatedAt = :now, invitationTokenCreatedBy = :adminUserId, updatedAt = :now",
    ExpressionAttributeValues: {
      ":pending": "pending",
      ":now": now,
      ":adminUserId": adminUserId || null,
    },
  });

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

export async function markInvitationEmailSent({
  userId,
  adminUserId,
}: {
  userId: string;
  adminUserId?: string | null;
}) {
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    UpdateExpression:
      "SET invitationEmailSentAt = :now, invitationEmailSentBy = :adminUserId, invitationStatus = :pending, membershipStatus = :invited, membershipProvider = :provider, updatedAt = :now",
    ExpressionAttributeValues: {
      ":now": now,
      ":adminUserId": adminUserId || null,
      ":pending": "pending",
      ":invited": "invited",
      ":provider": "admin_invite",
    },
  });
  return now;
}

export async function activateInvitation(token: string) {
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
    await documentClient.delete({ TableName: TABLE_NAME, Key: invitationKey(tokenHash) });
    throw new InvitationError("This invitation link has expired.", 410);
  }

  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: userKey(String(item.userId)),
    UpdateExpression:
      "SET membershipStatus = :active, membershipProvider = :provider, membershipVerifiedAt = :now, invitationStatus = :accepted, invitationAcceptedAt = :now, updatedAt = :now",
    ConditionExpression:
      "attribute_exists(#pk) AND (attribute_not_exists(#membershipStatus) OR #membershipStatus <> :active)",
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#membershipStatus": "membershipStatus",
    },
    ExpressionAttributeValues: {
      ":active": "active",
      ":provider": "admin_invite",
      ":accepted": "accepted",
      ":now": now,
    },
  }).catch((err: any) => {
    if (err?.name === "ConditionalCheckFailedException") {
      throw new InvitationError("This invitation has already been activated.", 409);
    }
    throw err;
  });

  await documentClient.delete({
    TableName: TABLE_NAME,
    Key: invitationKey(tokenHash),
  });

  const communitySync = await syncCoalitionMemberToCommunityById({
    userId: String(item.userId),
    triggeredBy: "invitation_activation",
  });

  return {
    ok: true,
    userId: String(item.userId),
    email: typeof item.email === "string" ? item.email : null,
    activatedAt: now,
    communitySync,
  };
}
