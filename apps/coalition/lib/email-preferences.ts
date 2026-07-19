import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type MemberEmailCategory = "newsletter" | "policy_update";

type RawEmailPreferenceUser = Record<string, unknown> & {
  emailSuppressed?: boolean | null;
  emailSuppressedReason?: string | null;
  emailNewsletterOptIn?: boolean | null;
  emailPolicyUpdateOptIn?: boolean | null;
};

export type MemberEmailPreferences = {
  newsletter: boolean;
  policyUpdates: boolean;
  globallySuppressed: boolean;
  suppressionReason: string | null;
  canSelfResubscribe: boolean;
};

const userKey = (userId: string) => ({
  pk: `USER#${userId}`,
  sk: `USER#${userId}`,
});

const preferenceField = (category: MemberEmailCategory) =>
  category === "newsletter" ? "emailNewsletterOptIn" : "emailPolicyUpdateOptIn";

const isConditionalCheckFailure = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "name" in error &&
  error.name === "ConditionalCheckFailedException";

export function memberAcceptsEmailCategory(
  user: RawEmailPreferenceUser,
  category: MemberEmailCategory,
) {
  if (user.emailSuppressed === true) return false;
  return user[preferenceField(category)] !== false;
}

export function emailPreferencesFromUser(user: RawEmailPreferenceUser): MemberEmailPreferences {
  const globallySuppressed = user.emailSuppressed === true;
  const suppressionReason =
    typeof user.emailSuppressedReason === "string" ? user.emailSuppressedReason : null;
  return {
    newsletter: !globallySuppressed && user.emailNewsletterOptIn !== false,
    policyUpdates: !globallySuppressed && user.emailPolicyUpdateOptIn !== false,
    globallySuppressed,
    suppressionReason,
    canSelfResubscribe: !globallySuppressed || suppressionReason === "newsletter_unsubscribe",
  };
}

export async function getMemberEmailPreferences(userId: string) {
  const result = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    ProjectionExpression:
      "emailSuppressed, emailSuppressedReason, emailNewsletterOptIn, emailPolicyUpdateOptIn",
  });
  if (!result.Item) throw new Error("User not found.");
  return emailPreferencesFromUser(result.Item);
}

export async function updateMemberEmailPreferences({
  userId,
  newsletter,
  policyUpdates,
}: {
  userId: string;
  newsletter: boolean;
  policyUpdates: boolean;
}) {
  const current = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    ProjectionExpression: "emailSuppressed, emailSuppressedReason",
  });
  if (!current.Item) throw new Error("User not found.");

  const now = new Date().toISOString();
  const canClearLegacySuppression =
    (newsletter || policyUpdates) &&
    current.Item.emailSuppressed === true &&
    current.Item.emailSuppressedReason === "newsletter_unsubscribe";
  const preferenceValues = {
    ":newsletter": newsletter,
    ":policyUpdates": policyUpdates,
    ":now": now,
    ":member": "member",
  };

  let result;
  try {
    result = await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression: canClearLegacySuppression
        ? "SET emailNewsletterOptIn = :newsletter, emailPolicyUpdateOptIn = :policyUpdates, emailPreferencesUpdatedAt = :now, emailPreferencesUpdatedBy = :member, emailSuppressed = :notSuppressed REMOVE emailSuppressedAt, emailSuppressedReason, emailSuppressedBy"
        : "SET emailNewsletterOptIn = :newsletter, emailPolicyUpdateOptIn = :policyUpdates, emailPreferencesUpdatedAt = :now, emailPreferencesUpdatedBy = :member",
      ConditionExpression: canClearLegacySuppression
        ? "attribute_exists(pk) AND emailSuppressed = :suppressed AND emailSuppressedReason = :legacyReason"
        : "attribute_exists(pk)",
      ExpressionAttributeValues: {
        ...preferenceValues,
        ...(canClearLegacySuppression
          ? {
              ":notSuppressed": false,
              ":suppressed": true,
              ":legacyReason": "newsletter_unsubscribe",
            }
          : {}),
      },
      ReturnValues: "ALL_NEW",
    });
  } catch (error) {
    if (!canClearLegacySuppression || !isConditionalCheckFailure(error)) throw error;

    const latest = await documentClient.get({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      ProjectionExpression: "emailSuppressed, emailSuppressedReason",
    });
    if (!latest.Item) throw new Error("User not found.");

    result = await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression:
        "SET emailNewsletterOptIn = :newsletter, emailPolicyUpdateOptIn = :policyUpdates, emailPreferencesUpdatedAt = :now, emailPreferencesUpdatedBy = :member",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: preferenceValues,
      ReturnValues: "ALL_NEW",
    });
  }

  return emailPreferencesFromUser(result.Attributes || {});
}

export async function unsubscribeMemberFromEmailCategory({
  userId,
  category,
  now = new Date().toISOString(),
}: {
  userId: string;
  category: MemberEmailCategory;
  now?: string;
}) {
  const field = preferenceField(category);
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey(userId),
      UpdateExpression:
        "SET #preference = :disabled, emailPreferencesUpdatedAt = :now, emailPreferencesUpdatedBy = :source",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: { "#preference": field },
      ExpressionAttributeValues: {
        ":disabled": false,
        ":now": now,
        ":source": `${category}_unsubscribe`,
      },
    });
    return true;
  } catch (error) {
    if (isConditionalCheckFailure(error)) return false;
    throw error;
  }
}
