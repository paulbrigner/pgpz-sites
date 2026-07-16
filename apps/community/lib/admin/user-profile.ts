import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { getUserDisplayName, textOrNull } from "@/lib/user-display-name";

export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  membershipStatus: "active" | "none";
  emailSuppressed: boolean | null;
  accountStatus: "active" | "deactivated";
  deactivatedAt: string | null;
};

const coerceUserProfile = (data: any): UserProfile | null => {
  if (!data?.id) return null;
  return {
    id: String(data.id),
    name: textOrNull(data.name),
    email: textOrNull(data.email),
    firstName: textOrNull(data.firstName),
    lastName: textOrNull(data.lastName),
    membershipStatus: data.membershipStatus === "active" ? "active" : "none",
    emailSuppressed: typeof data.emailSuppressed === "boolean" ? data.emailSuppressed : null,
    accountStatus: data.accountStatus === "deactivated" || !!data.deactivatedAt ? "deactivated" : "active",
    deactivatedAt: textOrNull(data.deactivatedAt),
  };
};

export async function findUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: { ":pk": `USER#${normalizedEmail}`, ":sk": `USER#${normalizedEmail}` },
    Limit: 1,
  });
  return coerceUserProfile(res.Items?.[0]);
}

export async function findUserProfileById(id: string): Promise<UserProfile | null> {
  const userId = id.trim();
  if (!userId) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
  });
  return coerceUserProfile(res.Item);
}

export const getUserProfileDisplayName = getUserDisplayName;
