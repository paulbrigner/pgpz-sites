import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { normalizeEmail, userKey } from "@/lib/app-users";
import {
  assertCompatibleEmailOwnership,
  claimEmailOwnershipTransactionItem,
  emailOwnershipKey,
  EmailOwnershipCollisionError,
  releaseEmailOwnershipTransactionItem,
  type EmailOwnershipRecord,
} from "@/lib/email-ownership";

const BETTER_AUTH_USER_TYPE = "BETTER_AUTH#better_auth_users";
const BETTER_AUTH_SESSION_TYPE = "BETTER_AUTH#better_auth_sessions";
const BETTER_AUTH_ACCOUNT_TYPE = "BETTER_AUTH#better_auth_accounts";
const BETTER_AUTH_VERIFICATION_TYPE = "BETTER_AUTH#better_auth_verifications";

type BetterAuthUserRecord = {
  id: string;
  email: string;
};

export type DynamoRecordKey = {
  pk: string;
  sk: string;
};

type LifecycleRecord = DynamoRecordKey & {
  type?: string;
  userId?: string;
  value?: unknown;
};

export type AdditionalTransactItem = Record<string, unknown>;

const betterAuthUserKey = (id: string) => ({
  pk: `${BETTER_AUTH_USER_TYPE}#${id}`,
  sk: `${BETTER_AUTH_USER_TYPE}#${id}`,
});

async function findBetterAuthUsersByEmail(email: string): Promise<BetterAuthUserRecord[]> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const result = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :gsi1pk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
    ExpressionAttributeValues: {
      ":gsi1pk": `${BETTER_AUTH_USER_TYPE}#email#${normalizedEmail}`,
    },
  });

  return (result.Items || [])
    .filter((item) => item.type === BETTER_AUTH_USER_TYPE && typeof item.id === "string")
    .map((item) => ({ id: String(item.id), email: normalizeEmail(item.email) }));
}

export class BetterAuthEmailCollisionError extends Error {
  constructor() {
    super("That email is already in use.");
    this.name = "BetterAuthEmailCollisionError";
  }
}

async function getEmailOwnership(email: string): Promise<EmailOwnershipRecord | null> {
  const result = await documentClient.get({
    TableName: TABLE_NAME,
    Key: emailOwnershipKey(email),
    ConsistentRead: true,
  });
  return (result.Item as EmailOwnershipRecord | undefined) || null;
}

function assertOwnership(
  ownership: EmailOwnershipRecord | null,
  bindings: { appUserId?: string; betterAuthUserId?: string },
) {
  try {
    assertCompatibleEmailOwnership(ownership, bindings);
  } catch (error) {
    if (error instanceof EmailOwnershipCollisionError) {
      throw new BetterAuthEmailCollisionError();
    }
    throw error;
  }
}

const protectedAppUserAttributes = new Set([
  "pk",
  "sk",
  "id",
  "email",
  "GSI1PK",
  "GSI1SK",
  "updatedAt",
]);

function appUserAttributeUpdates(attributes: Record<string, unknown> | undefined) {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const assignments: string[] = [];

  for (const [attribute, value] of Object.entries(attributes || {})) {
    if (protectedAppUserAttributes.has(attribute)) {
      throw new Error(`Cannot update protected application user attribute: ${attribute}`);
    }
    const index = assignments.length;
    names[`#app${index}`] = attribute;
    values[`:app${index}`] = value;
    assignments.push(`#app${index} = :app${index}`);
  }

  return { names, values, assignments };
}

const recordKey = (item: Record<string, unknown>): DynamoRecordKey | null =>
  typeof item.pk === "string" && typeof item.sk === "string"
    ? { pk: item.pk, sk: item.sk }
    : null;

function verificationBelongsToEmail(item: LifecycleRecord, email: string) {
  if (!email) return false;
  if (typeof item.value === "object" && item.value !== null) {
    return normalizeEmail((item.value as Record<string, unknown>).email) === email;
  }
  if (typeof item.value !== "string") return false;
  try {
    const parsed = JSON.parse(item.value) as Record<string, unknown>;
    return normalizeEmail(parsed.email) === email;
  } catch {
    return false;
  }
}

/**
 * Finds the records that must be revoked or removed with an application account.
 *
 * Better Auth sessions/accounts are linked by the Better Auth user id, which may
 * differ from the application user id for pre-cutover accounts. Verification
 * identifiers are hashed, so ownership is established from the stored payload's
 * normalized email rather than by guessing the identifier hash.
 */
export async function collectAccountLifecycleArtifacts({
  appUserId,
  email,
}: {
  appUserId: string;
  email: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  const betterAuthUsers = await findBetterAuthUsersByEmail(normalizedEmail);
  if (betterAuthUsers.length > 1) {
    throw new Error("Multiple Better Auth accounts match this application account.");
  }
  const betterAuthUser = betterAuthUsers[0] || null;

  const records: LifecycleRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await documentClient.scan({
      TableName: TABLE_NAME,
      FilterExpression:
        "#type IN (:sessionType, :accountType, :verificationType, :invitationType, :emailChangeType)",
      ProjectionExpression: "pk, sk, #type, userId, #value",
      ExpressionAttributeNames: { "#type": "type", "#value": "value" },
      ExpressionAttributeValues: {
        ":sessionType": BETTER_AUTH_SESSION_TYPE,
        ":accountType": BETTER_AUTH_ACCOUNT_TYPE,
        ":verificationType": BETTER_AUTH_VERIFICATION_TYPE,
        ":invitationType": "INVITATION_TOKEN",
        ":emailChangeType": "VT",
      },
      ExclusiveStartKey,
    });
    for (const item of result.Items || []) records.push(item as LifecycleRecord);
    ExclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);

  const invitationKeys: DynamoRecordKey[] = [];
  const sessionKeys: DynamoRecordKey[] = [];
  const accountKeys: DynamoRecordKey[] = [];
  const verificationKeys: DynamoRecordKey[] = [];
  const emailChangeKeys: DynamoRecordKey[] = [];
  for (const item of records) {
    const key = recordKey(item);
    if (!key) continue;
    if (item.type === "INVITATION_TOKEN" && item.userId === appUserId) {
      invitationKeys.push(key);
    } else if (item.type === BETTER_AUTH_SESSION_TYPE && item.userId === betterAuthUser?.id) {
      sessionKeys.push(key);
    } else if (item.type === BETTER_AUTH_ACCOUNT_TYPE && item.userId === betterAuthUser?.id) {
      accountKeys.push(key);
    } else if (
      item.type === BETTER_AUTH_VERIFICATION_TYPE &&
      (item.userId === betterAuthUser?.id || verificationBelongsToEmail(item, normalizedEmail))
    ) {
      verificationKeys.push(key);
    } else if (
      item.type === "VT" &&
      item.userId === appUserId &&
      item.pk === `VT#EMAIL_CHANGE#${appUserId}`
    ) {
      emailChangeKeys.push(key);
    }
  }

  return {
    betterAuthUserId: betterAuthUser?.id || null,
    betterAuthUserKey: betterAuthUser ? betterAuthUserKey(betterAuthUser.id) : null,
    invitationKeys,
    sessionKeys,
    accountKeys,
    verificationKeys,
    emailChangeKeys,
    revocableKeys: [...invitationKeys, ...sessionKeys, ...verificationKeys, ...emailChangeKeys],
    deletableDependentKeys: [
      ...invitationKeys,
      ...sessionKeys,
      ...accountKeys,
      ...verificationKeys,
      ...emailChangeKeys,
    ],
  };
}

export async function updateAppAndBetterAuthUserEmail({
  appUserId,
  betterAuthUserId,
  oldEmail,
  newEmail,
  appUserAttributes,
  requireActiveAccount = false,
  additionalTransactItems = [],
}: {
  appUserId: string;
  betterAuthUserId?: string;
  oldEmail: string;
  newEmail: string;
  appUserAttributes?: Record<string, unknown>;
  requireActiveAccount?: boolean;
  additionalTransactItems?: AdditionalTransactItem[];
}) {
  const normalizedOldEmail = normalizeEmail(oldEmail);
  const normalizedNewEmail = normalizeEmail(newEmail);
  let normalizedBetterAuthUserId = betterAuthUserId?.trim() || "";
  const now = new Date().toISOString();
  const additional = appUserAttributeUpdates(appUserAttributes);
  const appUpdate = {
    TableName: TABLE_NAME,
    Key: userKey(appUserId),
    UpdateExpression:
      `SET #email = :newEmail, #gsi1pk = :appGsi, #gsi1sk = :appGsi, #updatedAt = :updatedAt${additional.assignments.length ? `, ${additional.assignments.join(", ")}` : ""}`,
    ConditionExpression:
      `attribute_exists(#pk) AND #email = :oldEmail${requireActiveAccount ? " AND (attribute_not_exists(#accountStatus) OR #accountStatus = :activeAccount) AND attribute_not_exists(#deactivatedAt)" : ""}`,
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#email": "email",
      "#gsi1pk": "GSI1PK",
      "#gsi1sk": "GSI1SK",
      "#updatedAt": "updatedAt",
      ...(requireActiveAccount
        ? { "#accountStatus": "accountStatus", "#deactivatedAt": "deactivatedAt" }
        : {}),
      ...additional.names,
    },
    ExpressionAttributeValues: {
      ":oldEmail": normalizedOldEmail,
      ":newEmail": normalizedNewEmail,
      ":appGsi": `USER#${normalizedNewEmail}`,
      ":updatedAt": now,
      ...(requireActiveAccount ? { ":activeAccount": "active" } : {}),
      ...additional.values,
    },
  };
  const sourceOwnership = await getEmailOwnership(normalizedOldEmail);
  if (!normalizedBetterAuthUserId && sourceOwnership?.betterAuthUserId) {
    normalizedBetterAuthUserId = sourceOwnership.betterAuthUserId;
  }
  if (!normalizedBetterAuthUserId) {
    const sourceUsers = await findBetterAuthUsersByEmail(normalizedOldEmail);
    if (sourceUsers.length > 1) {
      throw new Error("Multiple Better Auth accounts match the current email.");
    }
    normalizedBetterAuthUserId = sourceUsers[0]?.id || "";
  }

  assertOwnership(sourceOwnership, {
    appUserId,
    ...(normalizedBetterAuthUserId ? { betterAuthUserId: normalizedBetterAuthUserId } : {}),
  });
  const targetOwnership = await getEmailOwnership(normalizedNewEmail);
  assertOwnership(targetOwnership, {
    appUserId,
    ...(normalizedBetterAuthUserId ? { betterAuthUserId: normalizedBetterAuthUserId } : {}),
  });

  if (!normalizedBetterAuthUserId) {
    const transactItems: any[] = [
      ...additionalTransactItems,
      claimEmailOwnershipTransactionItem({
        tableName: TABLE_NAME,
        email: normalizedNewEmail,
        appUserId,
        now,
      }),
      { Update: appUpdate },
    ];
    if (normalizedOldEmail !== normalizedNewEmail) {
      transactItems.push(
        releaseEmailOwnershipTransactionItem({
          tableName: TABLE_NAME,
          email: normalizedOldEmail,
          appUserId,
        }),
      );
    }
    try {
      await documentClient.transactWrite({ TransactItems: transactItems });
    } catch (error) {
      const currentTarget = await getEmailOwnership(normalizedNewEmail);
      assertOwnership(currentTarget, { appUserId });
      throw error;
    }
    return { betterAuthUpdated: false };
  }
  const targetUsers = await findBetterAuthUsersByEmail(normalizedNewEmail);
  if (targetUsers.some((user) => user.id !== normalizedBetterAuthUserId)) {
    throw new BetterAuthEmailCollisionError();
  }

  const transactItems: any[] = [
    ...additionalTransactItems,
    claimEmailOwnershipTransactionItem({
      tableName: TABLE_NAME,
      email: normalizedNewEmail,
      appUserId,
      betterAuthUserId: normalizedBetterAuthUserId,
      now,
    }),
    {
      Update: appUpdate,
    },
    {
      Update: {
        TableName: TABLE_NAME,
        Key: betterAuthUserKey(normalizedBetterAuthUserId),
        UpdateExpression:
          "SET #email = :newEmail, #gsi1pk = :betterAuthGsi, #gsi1sk = :betterAuthUserId, #updatedAt = :updatedAt",
        ConditionExpression: "attribute_exists(#pk) AND #email = :oldEmail",
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#email": "email",
          "#gsi1pk": "GSI1PK",
          "#gsi1sk": "GSI1SK",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":oldEmail": normalizedOldEmail,
          ":newEmail": normalizedNewEmail,
          ":betterAuthGsi": `${BETTER_AUTH_USER_TYPE}#email#${normalizedNewEmail}`,
          ":betterAuthUserId": normalizedBetterAuthUserId,
          ":updatedAt": now,
        },
      },
    },
  ];
  if (normalizedOldEmail !== normalizedNewEmail) {
    transactItems.push(
      releaseEmailOwnershipTransactionItem({
        tableName: TABLE_NAME,
        email: normalizedOldEmail,
        appUserId,
        betterAuthUserId: normalizedBetterAuthUserId,
      }),
    );
  }
  try {
    await documentClient.transactWrite({ TransactItems: transactItems });
  } catch (error) {
    const currentTarget = await getEmailOwnership(normalizedNewEmail);
    assertOwnership(currentTarget, {
      appUserId,
      betterAuthUserId: normalizedBetterAuthUserId,
    });
    throw error;
  }
  return { betterAuthUpdated: true };
}
