/**
 * Create or rotate a Board portal account directly in the board DynamoDB table.
 *
 * The portal disables self-registration, so every account is provisioned here
 * by the board administrator. Passwords are hashed with Better Auth's own
 * scrypt implementation (better-auth/crypto), so newly created records sign in
 * through the normal email-and-password flow.
 *
 * Usage:
 *   REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZBoardNextAuth \
 *     npx tsx scripts/provision-board-member.ts ada@example.org \
 *       --name "Ada Director"
 *
 * Options:
 *   --name <name>          Display name (defaults to the email's local part)
 *   --password <secret>    Set a specific password (minimum 12 characters)
 *   --show-password        Print the password used (required for generated ones)
 *
 * Security notes:
 *   - Without --password a random 24-character password is generated and
 *     printed exactly once; deliver it over a private channel.
 *   - If BOARD_MEMBER_EMAILS is set in the environment, the script refuses to
 *     provision emails outside that allowlist.
 *   - Rerunning the script for the same email rotates the password hash and
 *     invalidates the old password immediately (existing sessions survive
 *     until their cookie expires).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { hashPassword } from "better-auth/crypto";

const REGION = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.NEXTAUTH_TABLE || "PGPZBoardNextAuth";
const ALLOWLIST = new Set(
  (process.env.BOARD_MEMBER_EMAILS || "")
    .split(/[\s,]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const USER_TYPE = "BETTER_AUTH#better_auth_users";
const ACCOUNT_TYPE = "BETTER_AUTH#better_auth_accounts";

const documentClient = DynamoDBDocument.from(new DynamoDBClient({ region: REGION }));

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function findUserByEmail(email: string) {
  const result = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "GSI1PK" },
    ExpressionAttributeValues: { ":pk": `${USER_TYPE}#email#${email}` },
    Limit: 5,
  });
  return (result.Items || []).find((item) => item.email === email) || null;
}

async function findAccountForUser(userId: string) {
  const result = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI2",
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "GSI2PK" },
    ExpressionAttributeValues: { ":pk": `${ACCOUNT_TYPE}#userId#${userId}` },
    Limit: 5,
  });
  return (result.Items || []).find((item) => item.providerId === "credential") || null;
}

function userRecord(userId: string, email: string, name: string) {
  const now = new Date().toISOString();
  return {
    pk: `${USER_TYPE}#${userId}`,
    sk: `${USER_TYPE}#${userId}`,
    type: USER_TYPE,
    id: userId,
    name,
    email,
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
    GSI1PK: `${USER_TYPE}#email#${email}`,
    GSI1SK: userId,
    adapterVersion: 1,
  };
}

function accountRecord(userId: string, passwordHash: string, previousVersion = 0) {
  const now = new Date().toISOString();
  return {
    pk: `${ACCOUNT_TYPE}#${userId}`,
    sk: `${ACCOUNT_TYPE}#${userId}`,
    type: ACCOUNT_TYPE,
    id: userId,
    userId,
    accountId: userId,
    providerId: "credential",
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
    GSI1PK: `${ACCOUNT_TYPE}#provider#credential#${userId}`,
    GSI1SK: userId,
    GSI2PK: `${ACCOUNT_TYPE}#userId#${userId}`,
    GSI2SK: userId,
    adapterVersion: previousVersion + 1,
  };
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        options.set(arg.slice(2), "true");
      } else {
        options.set(arg.slice(2), value);
        index += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const email = normalizeEmail(positional[0] || "");
  if (!email.includes("@")) {
    console.error("Usage: npx tsx scripts/provision-board-member.ts <email> [--name NAME] [--password SECRET] [--show-password]");
    process.exit(1);
  }

  if (ALLOWLIST.size > 0 && !ALLOWLIST.has(email)) {
    console.error(`Refusing to provision ${email}: the email is not on the BOARD_MEMBER_EMAILS allowlist.`);
    process.exit(1);
  }

  const name = (options.get("name") || email.split("@")[0] || email).trim();
  const explicitPassword = options.get("password");
  if (explicitPassword === "true") {
    console.error("--password requires a value.");
    process.exit(1);
  }
  const password = explicitPassword || randomBytes(18).toString("base64url");
  if (password.length < 12) {
    console.error("Password must be at least 12 characters long.");
    process.exit(1);
  }
  const showPassword = explicitPassword !== undefined || options.get("show-password") === "true";

  const passwordHash = await hashPassword(password);

  const existingUser = await findUserByEmail(email);
  let userId: string;
  let action: "created" | "rotated";

  if (existingUser?.id) {
    userId = String(existingUser.id);
    action = "rotated";
  } else {
    userId = randomUUID();
    await documentClient.put({
      TableName: TABLE_NAME,
      Item: userRecord(userId, email, name),
    });
    action = "created";
  }

  const existingAccount = await findAccountForUser(userId);
  const previousVersion =
    existingAccount && Number.isInteger(existingAccount.adapterVersion)
      ? Number(existingAccount.adapterVersion)
      : 0;
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: accountRecord(userId, passwordHash, previousVersion),
  });

  console.log(`[board] ${action} account for ${email} (name: ${name}) in ${TABLE_NAME}.`);
  if (action === "rotated") {
    console.log("[board] The previous password is no longer valid.");
  }
  if (showPassword) {
    console.log(`[board] Password: ${password}`);
    console.log("[board] Deliver it privately and tell the director to change it if the portal gains that feature.");
  } else {
    console.log("[board] A password was generated but not printed. Rerun with --show-password to recover it.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
