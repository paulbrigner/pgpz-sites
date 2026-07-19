import "server-only";

export const EMAIL_OWNERSHIP_TYPE = "EMAIL_OWNERSHIP";

export type EmailOwnershipRecord = {
  pk: string;
  sk: string;
  type: typeof EMAIL_OWNERSHIP_TYPE;
  email: string;
  appUserId?: string;
  betterAuthUserId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type EmailOwnershipBindings = {
  appUserId?: string | null;
  betterAuthUserId?: string | null;
};

export class EmailOwnershipCollisionError extends Error {
  constructor() {
    super("That email is already in use.");
    this.name = "EmailOwnershipCollisionError";
  }
}

export const normalizeOwnedEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const emailOwnershipKey = (email: string) => {
  const normalizedEmail = normalizeOwnedEmail(email);
  if (!normalizedEmail) throw new Error("Email ownership requires a normalized email.");
  return {
    pk: `${EMAIL_OWNERSHIP_TYPE}#${normalizedEmail}`,
    sk: `${EMAIL_OWNERSHIP_TYPE}#${normalizedEmail}`,
  };
};

const normalizedOwnerId = (value: string | null | undefined) =>
  typeof value === "string" ? value.trim() : "";

export function assertCompatibleEmailOwnership(
  record: Partial<EmailOwnershipRecord> | null | undefined,
  bindings: EmailOwnershipBindings,
) {
  if (!record) return;
  const appUserId = normalizedOwnerId(bindings.appUserId);
  const betterAuthUserId = normalizedOwnerId(bindings.betterAuthUserId);
  const recordEmail = normalizeOwnedEmail(record.email);
  const expectedKey = recordEmail ? emailOwnershipKey(recordEmail) : null;
  if (
    (record.type && record.type !== EMAIL_OWNERSHIP_TYPE) ||
    !expectedKey ||
    record.pk !== expectedKey.pk ||
    record.sk !== expectedKey.sk ||
    (appUserId && record.appUserId && record.appUserId !== appUserId) ||
    (betterAuthUserId && record.betterAuthUserId && record.betterAuthUserId !== betterAuthUserId)
  ) {
    throw new EmailOwnershipCollisionError();
  }
}

export function claimEmailOwnershipTransactionItem({
  tableName,
  email,
  appUserId,
  betterAuthUserId,
  now = new Date().toISOString(),
}: {
  tableName: string;
  email: string;
  appUserId?: string | null;
  betterAuthUserId?: string | null;
  now?: string;
}) {
  const normalizedEmail = normalizeOwnedEmail(email);
  const normalizedAppUserId = normalizedOwnerId(appUserId);
  const normalizedBetterAuthUserId = normalizedOwnerId(betterAuthUserId);
  if (!normalizedAppUserId && !normalizedBetterAuthUserId) {
    throw new Error("Email ownership requires at least one owner.");
  }

  const names: Record<string, string> = {
    "#pk": "pk",
    "#type": "type",
    "#email": "email",
    "#createdAt": "createdAt",
    "#updatedAt": "updatedAt",
  };
  const values: Record<string, unknown> = {
    ":type": EMAIL_OWNERSHIP_TYPE,
    ":email": normalizedEmail,
    ":now": now,
  };
  const conditions = [
    "(attribute_not_exists(#pk) OR #type = :type)",
    "(attribute_not_exists(#email) OR #email = :email)",
  ];
  const assignments = [
    "#type = :type",
    "#email = :email",
    "#createdAt = if_not_exists(#createdAt, :now)",
    "#updatedAt = :now",
  ];

  if (normalizedAppUserId) {
    names["#appUserId"] = "appUserId";
    values[":appUserId"] = normalizedAppUserId;
    conditions.push("(attribute_not_exists(#appUserId) OR #appUserId = :appUserId)");
    assignments.push("#appUserId = :appUserId");
  }
  if (normalizedBetterAuthUserId) {
    names["#betterAuthUserId"] = "betterAuthUserId";
    values[":betterAuthUserId"] = normalizedBetterAuthUserId;
    conditions.push(
      "(attribute_not_exists(#betterAuthUserId) OR #betterAuthUserId = :betterAuthUserId)",
    );
    assignments.push("#betterAuthUserId = :betterAuthUserId");
  }

  return {
    Update: {
      TableName: tableName,
      Key: emailOwnershipKey(normalizedEmail),
      UpdateExpression: `SET ${assignments.join(", ")}`,
      ConditionExpression: conditions.join(" AND "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

export function releaseEmailOwnershipTransactionItem({
  tableName,
  email,
  appUserId,
  betterAuthUserId,
}: {
  tableName: string;
  email: string;
  appUserId?: string | null;
  betterAuthUserId?: string | null;
}) {
  const normalizedEmail = normalizeOwnedEmail(email);
  const normalizedAppUserId = normalizedOwnerId(appUserId);
  const normalizedBetterAuthUserId = normalizedOwnerId(betterAuthUserId);
  if (!normalizedAppUserId && !normalizedBetterAuthUserId) {
    throw new Error("Email ownership release requires at least one expected owner.");
  }

  const names: Record<string, string> = {
    "#pk": "pk",
    "#type": "type",
    "#email": "email",
    "#appUserId": "appUserId",
    "#betterAuthUserId": "betterAuthUserId",
  };
  const values: Record<string, unknown> = {
    ":type": EMAIL_OWNERSHIP_TYPE,
    ":email": normalizedEmail,
  };
  const ownerConditions: string[] = [];
  if (normalizedAppUserId) {
    values[":appUserId"] = normalizedAppUserId;
    ownerConditions.push("#appUserId = :appUserId");
  } else {
    ownerConditions.push("attribute_not_exists(#appUserId)");
  }
  if (normalizedBetterAuthUserId) {
    values[":betterAuthUserId"] = normalizedBetterAuthUserId;
    ownerConditions.push("#betterAuthUserId = :betterAuthUserId");
  } else {
    ownerConditions.push("attribute_not_exists(#betterAuthUserId)");
  }

  return {
    Delete: {
      TableName: tableName,
      Key: emailOwnershipKey(normalizedEmail),
      // Missing claims are tolerated during the pre-backfill compatibility
      // window. Existing claims must match every canonical owner exactly.
      ConditionExpression:
        `attribute_not_exists(#pk) OR (#type = :type AND #email = :email AND ${ownerConditions.join(" AND ")})`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

export function releaseBetterAuthOwnershipTransactionItem({
  tableName,
  email,
  betterAuthUserId,
  preserveAppOwner,
  now = new Date().toISOString(),
}: {
  tableName: string;
  email: string;
  betterAuthUserId: string;
  preserveAppOwner: boolean;
  now?: string;
}) {
  const normalizedEmail = normalizeOwnedEmail(email);
  const normalizedBetterAuthUserId = normalizedOwnerId(betterAuthUserId);
  if (!normalizedBetterAuthUserId) throw new Error("Better Auth owner id is required.");

  if (!preserveAppOwner) {
    return releaseEmailOwnershipTransactionItem({
      tableName,
      email: normalizedEmail,
      betterAuthUserId: normalizedBetterAuthUserId,
    });
  }

  return {
    Update: {
      TableName: tableName,
      Key: emailOwnershipKey(normalizedEmail),
      UpdateExpression: "SET #updatedAt = :now REMOVE #betterAuthUserId",
      ConditionExpression:
        "#type = :type AND #email = :email AND attribute_exists(#appUserId) AND #betterAuthUserId = :betterAuthUserId",
      ExpressionAttributeNames: {
        "#type": "type",
        "#email": "email",
        "#appUserId": "appUserId",
        "#betterAuthUserId": "betterAuthUserId",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":type": EMAIL_OWNERSHIP_TYPE,
        ":email": normalizedEmail,
        ":betterAuthUserId": normalizedBetterAuthUserId,
        ":now": now,
      },
    },
  };
}
