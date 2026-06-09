/**
 * Set or unset isAdmin for a user by email.
 *
 * Usage:
 *   NEXTAUTH_TABLE=PGPZCommunityNextAuth REGION_AWS=us-east-1 npx tsx scripts/adminize.ts user@example.com
 *   NEXTAUTH_TABLE=PGPZCommunityNextAuth REGION_AWS=us-east-1 npx tsx scripts/adminize.ts user@example.com --unset
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.NEXTAUTH_TABLE || "PGPZCommunityNextAuth";

const documentClient = DynamoDBDocument.from(new DynamoDBClient({ region: REGION }));

type UserRecord = {
  id: string;
  email?: string | null;
};

async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: { ":pk": `USER#${email}`, ":sk": `USER#${email}` },
    Limit: 1,
  });
  const item = res.Items?.[0];
  if (!item?.id) return null;
  return {
    id: item.id as string,
    email: (item.email as string | undefined) || null,
  };
}

async function setAdminFlag(userId: string, isAdmin: boolean) {
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
    UpdateExpression: "SET isAdmin = :flag",
    ExpressionAttributeValues: { ":flag": isAdmin },
  });
}

async function main() {
  const args = process.argv.slice(2);
  const unset = args.includes("--unset");
  const email = args.find((arg) => !arg.startsWith("--"))?.trim().toLowerCase() || "";
  if (!email) {
    console.error("Usage: npx tsx scripts/adminize.ts <email> [--unset]");
    process.exit(1);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    console.error("User not found.");
    process.exit(1);
  }

  await setAdminFlag(user.id, !unset);
  console.log(`${unset ? "Removed" : "Granted"} admin for ${user.email || user.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
