import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME as COALITION_TABLE_NAME } from "@/lib/dynamodb";
import { PGPZ_COMMUNITY_NEXTAUTH_TABLE } from "@/lib/config";
import { isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import { textOrNull } from "@/lib/user-display-name";

export type CoalitionMemberForCommunitySync = {
  id: string;
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
  membershipStatus: string | null;
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  welcomeEmailSentAt: string | null;
  emailSuppressed: boolean | null;
  emailSuppressedAt: string | null;
  emailSuppressedReason: string | null;
  emailSuppressedBy: string | null;
  accountStatus: string | null;
  deactivatedAt: string | null;
};

export type CommunitySyncStatus =
  | "created"
  | "updated"
  | "already_active"
  | "skipped"
  | "conflict"
  | "failed";

export type CommunitySyncResult = {
  status: CommunitySyncStatus;
  coalitionUserId: string | null;
  communityUserId: string | null;
  email: string | null;
  message: string;
  dryRun: boolean;
};

type SyncOptions = {
  dryRun?: boolean;
  triggeredBy?: string | null;
  now?: string;
};

type CommunityUserRecord = {
  id?: string;
  email?: string | null;
  accountStatus?: string | null;
  deactivatedAt?: string | null;
  membershipStatus?: string | null;
};

const COMMUNITY_TABLE_NAME = PGPZ_COMMUNITY_NEXTAUTH_TABLE || "PGPZCommunityNextAuth";
const COALITION_SYNC_REASON = "coalition_member";

const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: `USER#${userId}` });

const compactText = (value: unknown) => textOrNull(value) || null;

const cleanSourceUser = (item: any): CoalitionMemberForCommunitySync | null => {
  if (!item?.id) return null;
  return {
    id: String(item.id),
    name: compactText(item.name),
    email: compactText(item.email),
    firstName: compactText(item.firstName),
    lastName: compactText(item.lastName),
    linkedinUrl: compactText(item.linkedinUrl),
    xHandle: compactText(item.xHandle),
    membershipStatus: compactText(item.membershipStatus),
    membershipProvider: compactText(item.membershipProvider),
    membershipVerifiedAt: compactText(item.membershipVerifiedAt),
    welcomeEmailSentAt: compactText(item.welcomeEmailSentAt),
    emailSuppressed: typeof item.emailSuppressed === "boolean" ? item.emailSuppressed : null,
    emailSuppressedAt: compactText(item.emailSuppressedAt),
    emailSuppressedReason: compactText(item.emailSuppressedReason),
    emailSuppressedBy: compactText(item.emailSuppressedBy),
    accountStatus: compactText(item.accountStatus),
    deactivatedAt: compactText(item.deactivatedAt),
  };
};

const displayNameForSource = (source: CoalitionMemberForCommunitySync, email: string) =>
  source.name ||
  [source.firstName, source.lastName].filter(Boolean).join(" ").trim() ||
  email;

const result = ({
  status,
  source,
  communityUserId = null,
  email = null,
  message,
  dryRun,
}: {
  status: CommunitySyncStatus;
  source?: CoalitionMemberForCommunitySync | null;
  communityUserId?: string | null;
  email?: string | null;
  message: string;
  dryRun: boolean;
}): CommunitySyncResult => ({
  status,
  coalitionUserId: source?.id || null,
  communityUserId,
  email,
  message,
  dryRun,
});

async function findCommunityUsersByEmail(email: string): Promise<CommunityUserRecord[]> {
  const res = await documentClient.query({
    TableName: COMMUNITY_TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: { ":pk": `USER#${email}`, ":sk": `USER#${email}` },
    Limit: 2,
  });
  return (res.Items || []) as CommunityUserRecord[];
}

async function createCommunityMember({
  source,
  email,
  now,
  triggeredBy,
  dryRun,
}: {
  source: CoalitionMemberForCommunitySync;
  email: string;
  now: string;
  triggeredBy: string;
  dryRun: boolean;
}) {
  const communityUserId = randomUUID();
  if (dryRun) {
    return result({
      status: "created",
      source,
      communityUserId,
      email,
      message: "Would create active community member from coalition membership.",
      dryRun,
    });
  }

  const name = displayNameForSource(source, email);
  const item = {
    ...userKey(communityUserId),
    type: "USER",
    id: communityUserId,
    name,
    email,
    emailVerified: null,
    image: null,
    firstName: source.firstName,
    lastName: source.lastName,
    linkedinUrl: source.linkedinUrl,
    xHandle: source.xHandle,
    membershipStatus: "active",
    membershipProvider: "coalition_sync",
    membershipVerifiedAt: source.membershipVerifiedAt || now,
    accountStatus: "active",
    manualApprovalStatus: "none",
    welcomeEmailSuppressedAt: now,
    welcomeEmailSuppressedReason: COALITION_SYNC_REASON,
    welcomeEmailSuppressedBy: triggeredBy,
    coalitionSyncedAt: now,
    coalitionUserId: source.id,
    coalitionMembershipVerifiedAt: source.membershipVerifiedAt || now,
    coalitionMembershipProvider: source.membershipProvider,
    createdAt: now,
    updatedAt: now,
    GSI1PK: `USER#${email}`,
    GSI1SK: `USER#${email}`,
    emailSuppressed: source.emailSuppressed === true,
    emailSuppressedAt: source.emailSuppressed === true ? source.emailSuppressedAt || now : null,
    emailSuppressedReason: source.emailSuppressed === true ? source.emailSuppressedReason || "coalition_email_suppressed" : null,
    emailSuppressedBy: source.emailSuppressed === true ? source.emailSuppressedBy || triggeredBy : null,
  };

  await documentClient.put({
    TableName: COMMUNITY_TABLE_NAME,
    Item: item,
    ConditionExpression: "attribute_not_exists(#pk)",
    ExpressionAttributeNames: { "#pk": "pk" },
  });

  return result({
    status: "created",
    source,
    communityUserId,
    email,
    message: "Created active community member from coalition membership.",
    dryRun,
  });
}

async function updateCommunityMember({
  source,
  communityUser,
  email,
  now,
  triggeredBy,
  dryRun,
}: {
  source: CoalitionMemberForCommunitySync;
  communityUser: CommunityUserRecord;
  email: string;
  now: string;
  triggeredBy: string;
  dryRun: boolean;
}) {
  const communityUserId = communityUser.id || null;
  if (!communityUserId) {
    return result({
      status: "conflict",
      source,
      email,
      message: "Community record matched by email but does not have an id.",
      dryRun,
    });
  }

  if (communityUser.accountStatus === "deactivated" || communityUser.deactivatedAt) {
    return result({
      status: "conflict",
      source,
      communityUserId,
      email,
      message: "Community member is deactivated; leaving for manual review.",
      dryRun,
    });
  }

  const alreadyActive = communityUser.membershipStatus === "active";
  if (dryRun) {
    return result({
      status: alreadyActive ? "already_active" : "updated",
      source,
      communityUserId,
      email,
      message: alreadyActive
        ? "Would refresh coalition sync metadata on existing active community member."
        : "Would activate existing community member from coalition membership.",
      dryRun,
    });
  }

  const expressionAttributeNames: Record<string, string> = {
    "#pk": "pk",
    "#name": "name",
  };
  const expressionAttributeValues: Record<string, any> = {
    ":active": "active",
    ":provider": "coalition_sync",
    ":accountActive": "active",
    ":manualNone": "none",
    ":verifiedAt": source.membershipVerifiedAt || now,
    ":now": now,
    ":coalitionUserId": source.id,
    ":coalitionMembershipProvider": source.membershipProvider,
    ":reason": COALITION_SYNC_REASON,
    ":triggeredBy": triggeredBy,
    ":name": displayNameForSource(source, email),
  };
  const setParts = [
    "membershipStatus = :active",
    alreadyActive ? "membershipProvider = if_not_exists(membershipProvider, :provider)" : "membershipProvider = :provider",
    alreadyActive ? "membershipVerifiedAt = if_not_exists(membershipVerifiedAt, :verifiedAt)" : "membershipVerifiedAt = :verifiedAt",
    "accountStatus = :accountActive",
    "manualApprovalStatus = if_not_exists(manualApprovalStatus, :manualNone)",
    "welcomeEmailSuppressedAt = if_not_exists(welcomeEmailSuppressedAt, :now)",
    "welcomeEmailSuppressedReason = if_not_exists(welcomeEmailSuppressedReason, :reason)",
    "welcomeEmailSuppressedBy = if_not_exists(welcomeEmailSuppressedBy, :triggeredBy)",
    "coalitionSyncedAt = :now",
    "coalitionUserId = :coalitionUserId",
    "coalitionMembershipVerifiedAt = :verifiedAt",
    "coalitionMembershipProvider = :coalitionMembershipProvider",
    "updatedAt = :now",
    "#name = :name",
  ];

  const addTextPart = (field: string, value: string | null) => {
    if (!value) return;
    const valueKey = `:${field}`;
    setParts.push(`${field} = ${valueKey}`);
    expressionAttributeValues[valueKey] = value;
  };

  addTextPart("firstName", source.firstName);
  addTextPart("lastName", source.lastName);
  addTextPart("linkedinUrl", source.linkedinUrl);
  addTextPart("xHandle", source.xHandle);

  if (source.emailSuppressed === true) {
    setParts.push(
      "emailSuppressed = :emailSuppressed",
      "emailSuppressedAt = :emailSuppressedAt",
      "emailSuppressedReason = :emailSuppressedReason",
      "emailSuppressedBy = :emailSuppressedBy",
    );
    expressionAttributeValues[":emailSuppressed"] = true;
    expressionAttributeValues[":emailSuppressedAt"] = source.emailSuppressedAt || now;
    expressionAttributeValues[":emailSuppressedReason"] =
      source.emailSuppressedReason || "coalition_email_suppressed";
    expressionAttributeValues[":emailSuppressedBy"] = source.emailSuppressedBy || triggeredBy;
  }

  await documentClient.update({
    TableName: COMMUNITY_TABLE_NAME,
    Key: userKey(communityUserId),
    UpdateExpression: `SET ${setParts.join(", ")}`,
    ConditionExpression: "attribute_exists(#pk)",
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  return result({
    status: alreadyActive ? "already_active" : "updated",
    source,
    communityUserId,
    email,
    message: alreadyActive
      ? "Refreshed coalition sync metadata on existing active community member."
      : "Activated existing community member from coalition membership.",
    dryRun,
  });
}

export async function syncCoalitionMemberRecordToCommunity(
  source: CoalitionMemberForCommunitySync,
  options: SyncOptions = {},
): Promise<CommunitySyncResult> {
  const dryRun = options.dryRun === true;
  const now = options.now || new Date().toISOString();
  const triggeredBy = options.triggeredBy || "coalition_sync";

  if (COMMUNITY_TABLE_NAME === COALITION_TABLE_NAME) {
    return result({
      status: "failed",
      source,
      message: "Community sync table is configured to the coalition table; refusing to write.",
      dryRun,
    });
  }

  if (source.accountStatus === "deactivated" || source.deactivatedAt) {
    return result({
      status: "skipped",
      source,
      message: "Coalition member is deactivated.",
      dryRun,
    });
  }

  if (source.membershipStatus !== "active") {
    return result({
      status: "skipped",
      source,
      message: "Coalition member is not active.",
      dryRun,
    });
  }

  const email = normalizeEmail(source.email);
  if (!email || !isValidEmail(email)) {
    return result({
      status: "skipped",
      source,
      message: "Coalition member does not have a valid email address.",
      dryRun,
    });
  }

  const matches = await findCommunityUsersByEmail(email);
  if (matches.length > 1) {
    return result({
      status: "conflict",
      source,
      email,
      message: "Multiple community records match this email; leaving for manual review.",
      dryRun,
    });
  }

  if (!matches.length) {
    return createCommunityMember({ source, email, now, triggeredBy, dryRun });
  }

  return updateCommunityMember({
    source,
    communityUser: matches[0],
    email,
    now,
    triggeredBy,
    dryRun,
  });
}

async function markCoalitionSyncResult(syncResult: CommunitySyncResult, now: string) {
  if (!syncResult.coalitionUserId) return;

  const expressionAttributeValues: Record<string, any> = {
    ":status": syncResult.status,
    ":attemptedAt": now,
    ":message": syncResult.message,
    ":communityTable": COMMUNITY_TABLE_NAME,
  };
  const setParts = [
    "communitySyncStatus = :status",
    "communitySyncAttemptedAt = :attemptedAt",
    "communitySyncMessage = :message",
    "communitySyncTable = :communityTable",
  ];
  const removeParts: string[] = [];

  if (syncResult.communityUserId) {
    setParts.push("communityUserId = :communityUserId");
    expressionAttributeValues[":communityUserId"] = syncResult.communityUserId;
  }

  if (
    syncResult.status === "created" ||
    syncResult.status === "updated" ||
    syncResult.status === "already_active"
  ) {
    setParts.push("communitySyncedAt = :attemptedAt");
    removeParts.push("communitySyncError");
  } else {
    setParts.push("communitySyncError = :message");
  }

  await documentClient.update({
    TableName: COALITION_TABLE_NAME,
    Key: userKey(syncResult.coalitionUserId),
    UpdateExpression: `SET ${setParts.join(", ")}${removeParts.length ? ` REMOVE ${removeParts.join(", ")}` : ""}`,
    ExpressionAttributeValues: expressionAttributeValues,
  });
}

export async function getCoalitionMemberForCommunitySync(
  userId: string,
): Promise<CoalitionMemberForCommunitySync | null> {
  const id = userId.trim();
  if (!id) return null;
  const res = await documentClient.get({
    TableName: COALITION_TABLE_NAME,
    Key: userKey(id),
    ProjectionExpression:
      "id, #name, email, firstName, lastName, linkedinUrl, xHandle, membershipStatus, membershipProvider, membershipVerifiedAt, welcomeEmailSentAt, emailSuppressed, emailSuppressedAt, emailSuppressedReason, emailSuppressedBy, accountStatus, deactivatedAt",
    ExpressionAttributeNames: { "#name": "name" },
  });
  return cleanSourceUser(res.Item);
}

export async function syncCoalitionMemberToCommunityById({
  userId,
  dryRun,
  triggeredBy,
}: {
  userId: string;
  dryRun?: boolean;
  triggeredBy?: string | null;
}): Promise<CommunitySyncResult> {
  const now = new Date().toISOString();
  const source = await getCoalitionMemberForCommunitySync(userId);
  if (!source) {
    return result({
      status: "failed",
      message: "Coalition member was not found.",
      dryRun: dryRun === true,
    });
  }

  try {
    const syncResult = await syncCoalitionMemberRecordToCommunity(source, {
      dryRun,
      triggeredBy,
      now,
    });
    if (!dryRun) await markCoalitionSyncResult(syncResult, now);
    return syncResult;
  } catch (err: any) {
    const syncResult = result({
      status: "failed",
      source,
      message: err?.message || "Community sync failed.",
      dryRun: dryRun === true,
    });
    if (!dryRun) await markCoalitionSyncResult(syncResult, now);
    return syncResult;
  }
}

export async function listActiveCoalitionMembersForCommunitySync(): Promise<
  CoalitionMemberForCommunitySync[]
> {
  const items: CoalitionMemberForCommunitySync[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.scan({
      TableName: COALITION_TABLE_NAME,
      FilterExpression:
        "#type = :user AND membershipStatus = :active AND (attribute_not_exists(accountStatus) OR accountStatus <> :deactivated)",
      ProjectionExpression:
        "id, #name, email, firstName, lastName, linkedinUrl, xHandle, membershipStatus, membershipProvider, membershipVerifiedAt, welcomeEmailSentAt, emailSuppressed, emailSuppressedAt, emailSuppressedReason, emailSuppressedBy, accountStatus, deactivatedAt",
      ExpressionAttributeNames: { "#type": "type", "#name": "name" },
      ExpressionAttributeValues: {
        ":user": "USER",
        ":active": "active",
        ":deactivated": "deactivated",
      },
      ExclusiveStartKey,
    });

    for (const item of res.Items || []) {
      const source = cleanSourceUser(item);
      if (source) items.push(source);
    }
    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return items.sort((a, b) => {
    const aEmail = a.email || "";
    const bEmail = b.email || "";
    return aEmail.localeCompare(bEmail, undefined, { sensitivity: "base" });
  });
}
