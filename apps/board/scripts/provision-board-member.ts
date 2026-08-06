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
 *   --keep-sessions        Do not revoke the account's existing sessions on
 *                          rotation (revoked by default so the old password
 *                          and old cookies both stop working)
 *   --dry-run              Report the planned changes and session impact
 *                          without writing or deleting anything
 *
 * Security notes:
 *   - Without --password a random 24-character password is generated and
 *     printed exactly once; deliver it over a private channel.
 *   - If a roster allowlist is set in the environment, the script refuses to
 *     provision emails outside those allowlists (directors on the Board
 *     roster, staff on the ED or Legal Counsel staff roster).
 *   - Rerunning the script for the same email rotates the password hash and,
 *     by default, revokes every stored session, so both the old password and
 *     existing session cookies stop working immediately.
 *   - New identities are written transactionally (user + credential account
 *     in one TransactWriteItems), so a failure cannot leave a half-created
 *     account. Session revocation aborts with a non-zero exit if any deletion
 *     fails, so partial recovery is never silent.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { hashPassword } from "better-auth/crypto";

const REGION = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";

const USER_TYPE = "BETTER_AUTH#better_auth_users";
const ACCOUNT_TYPE = "BETTER_AUTH#better_auth_accounts";
const SESSION_TYPE = "BETTER_AUTH#better_auth_sessions";

/**
 * The minimal DynamoDB surface the provisioner uses. The real
 * DynamoDBDocument client satisfies this structurally, and tests inject a
 * recording fake so `--dry-run` can be asserted to be mutation-free.
 */
export type ProvisionDocumentClient = {
  query: (params: any) => Promise<any>;
  put: (params: any) => Promise<any>;
  delete: (params: any) => Promise<any>;
  transactWrite: (params: any) => Promise<any>;
};

/** The subset of a DynamoDB query response the provisioner reads. */
type ProvisionQueryResult = {
  Items?: Array<Record<string, unknown>>;
  LastEvaluatedKey?: Record<string, unknown>;
};

export type ProvisionOutcome = {
  action: "created" | "rotated";
  email: string;
  name: string;
  dryRun: boolean;
  /** Whether existing sessions were kept (no revocation on this run). */
  keepSessions: boolean;
  /** Number of sessions that will be (dry-run) or were (live) revoked. */
  sessionCount: number;
  password: string;
  showPassword: boolean;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function parseAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value || "")
      .split(/[\s,]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function findUserByEmail(
  client: ProvisionDocumentClient,
  tableName: string,
  email: string,
) {
  const result: ProvisionQueryResult = await client.query({
    TableName: tableName,
    IndexName: "GSI1",
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "GSI1PK" },
    ExpressionAttributeValues: { ":pk": `${USER_TYPE}#email#${email}` },
    Limit: 5,
  });
  return (result.Items || []).find((item) => item.email === email) || null;
}

async function findAccountForUser(
  client: ProvisionDocumentClient,
  tableName: string,
  userId: string,
) {
  const result: ProvisionQueryResult = await client.query({
    TableName: tableName,
    IndexName: "GSI2",
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "GSI2PK" },
    ExpressionAttributeValues: { ":pk": `${ACCOUNT_TYPE}#userId#${userId}` },
    Limit: 5,
  });
  return (result.Items || []).find((item) => item.providerId === "credential") || null;
}

async function queryUserSessions(
  client: ProvisionDocumentClient,
  tableName: string,
  userId: string,
): Promise<Array<{ pk: unknown; sk: unknown }>> {
  const sessions: Array<{ pk: unknown; sk: unknown }> = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result: ProvisionQueryResult = await client.query({
      TableName: tableName,
      IndexName: "GSI2",
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "GSI2PK" },
      ExpressionAttributeValues: { ":pk": `${SESSION_TYPE}#userId#${userId}` },
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
    });
    sessions.push(
      ...(result.Items || []).map((item) => ({ pk: item.pk, sk: item.sk })),
    );
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);
  return sessions;
}

/** Read-only: counts a user's sessions without deleting anything. */
async function countUserSessions(
  client: ProvisionDocumentClient,
  tableName: string,
  userId: string,
): Promise<number> {
  return (await queryUserSessions(client, tableName, userId)).length;
}

/**
 * Deletes every stored session record for a user. Rotating a password must
 * not leave existing session cookies usable, so successful rotation revokes
 * sessions by default (opt out with --keep-sessions). Any deletion failure
 * aborts so partial revocation is never silent.
 */
async function revokeUserSessions(
  client: ProvisionDocumentClient,
  tableName: string,
  userId: string,
): Promise<number> {
  const sessions = await queryUserSessions(client, tableName, userId);
  for (const session of sessions) {
    await client.delete({
      TableName: tableName,
      Key: { pk: session.pk, sk: session.sk },
    });
  }
  return sessions.length;
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

/**
 * Core provisioner, decoupled from the CLI and AWS client so tests can inject
 * a recording fake and prove that `--dry-run` never mutates storage.
 *
 * Reads only ever run before the dry-run branch. All writes and session
 * deletions are gated behind `dryRun === false`.
 */
export async function provisionBoardMember(params: {
  args: string[];
  env?: Record<string, string | undefined>;
  client: ProvisionDocumentClient;
}): Promise<ProvisionOutcome> {
  const env = params.env ?? {};
  const client = params.client;
  const tableName = env.NEXTAUTH_TABLE?.trim() || "PGPZBoardNextAuth";

  const allowlist = parseAllowlist(env.BOARD_MEMBER_EMAILS);
  const executiveDirectorAllowlist = parseAllowlist(env.BOARD_EXECUTIVE_DIRECTOR_EMAILS);
  const legalCounselAllowlist = parseAllowlist(env.BOARD_LEGAL_COUNSEL_EMAILS);

  const { positional, options } = parseArgs(params.args);
  const email = normalizeEmail(positional[0] || "");
  if (!email.includes("@")) {
    throw new Error("Usage: npx tsx scripts/provision-board-member.ts <email> [--name NAME] [--password SECRET] [--show-password] [--keep-sessions] [--dry-run]");
  }

  const onAnyAllowlist = allowlist.size + executiveDirectorAllowlist.size + legalCounselAllowlist.size > 0;
  if (
    onAnyAllowlist &&
    !allowlist.has(email) &&
    !executiveDirectorAllowlist.has(email) &&
    !legalCounselAllowlist.has(email)
  ) {
    throw new Error(
      `Refusing to provision ${email}: the email is not on the BOARD_MEMBER_EMAILS, BOARD_EXECUTIVE_DIRECTOR_EMAILS, or BOARD_LEGAL_COUNSEL_EMAILS allowlist.`,
    );
  }

  const name = (options.get("name") || email.split("@")[0] || email).trim();
  const explicitPassword = options.get("password");
  if (explicitPassword === "true") {
    throw new Error("--password requires a value.");
  }
  const password = explicitPassword || randomBytes(18).toString("base64url");
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters long.");
  }
  const showPassword = explicitPassword !== undefined || options.get("show-password") === "true";
  const keepSessions = options.get("keep-sessions") === "true";
  const dryRun = options.get("dry-run") === "true";

  const existingUser = await findUserByEmail(client, tableName, email);
  const action: "created" | "rotated" = existingUser?.id ? "rotated" : "created";
  const userId = existingUser?.id ? String(existingUser.id) : randomUUID();
  const existingAccount = await findAccountForUser(client, tableName, userId);
  const previousVersion =
    existingAccount && Number.isInteger(existingAccount.adapterVersion)
      ? Number(existingAccount.adapterVersion)
      : 0;

  // Read-only plan-time session count. Never deletes, even in dry-run mode.
  const plannedSessionCount = keepSessions
    ? 0
    : await countUserSessions(client, tableName, userId);

  if (dryRun) {
    return {
      action,
      email,
      name,
      dryRun: true,
      keepSessions,
      sessionCount: plannedSessionCount,
      password,
      showPassword,
    };
  }

  const passwordHash = await hashPassword(password);

  if (action === "created") {
    // User and credential account land atomically so a failure can never
    // leave a user without the means to sign in (or vice versa).
    await client.transactWrite({
      TransactItems: [
        { Put: { TableName: tableName, Item: userRecord(userId, email, name) } },
        { Put: { TableName: tableName, Item: accountRecord(userId, passwordHash, 0) } },
      ],
    });
  } else {
    await client.put({
      TableName: tableName,
      Item: accountRecord(userId, passwordHash, previousVersion),
    });
  }

  const sessionCount = keepSessions ? 0 : await revokeUserSessions(client, tableName, userId);
  return {
    action,
    email,
    name,
    dryRun: false,
    keepSessions,
    sessionCount,
    password,
    showPassword,
  };
}

async function main() {
  const client: ProvisionDocumentClient = DynamoDBDocument.from(
    new DynamoDBClient({ region: REGION }),
  );
  try {
    const outcome = await provisionBoardMember({
      args: process.argv.slice(2),
      env: process.env,
      client,
    });

    console.log(`[board] plan: ${outcome.action} account for ${outcome.email} (name: ${outcome.name}) in ${process.env.NEXTAUTH_TABLE?.trim() || "PGPZBoardNextAuth"}.`);
    console.log(
      `[board] plan: will ${outcome.keepSessions ? "keep" : `revoke ${outcome.sessionCount} session${outcome.sessionCount === 1 ? "" : "s"}`} for ${outcome.email}.`,
    );
    if (outcome.dryRun) {
      console.log("[board] dry-run: no writes performed.");
      return;
    }

    console.log(`[board] ${outcome.action} account for ${outcome.email} (name: ${outcome.name}).`);
    if (outcome.action === "rotated") {
      if (outcome.keepSessions) {
        console.log("[board] WARNING: existing sessions were kept; the old password alone is invalidated.");
      } else {
        console.log(`[board] Revoked ${outcome.sessionCount} existing session${outcome.sessionCount === 1 ? "" : "s"}; all devices must sign in again.`);
      }
    }
    if (outcome.showPassword) {
      console.log(`[board] Password: ${outcome.password}`);
      console.log("[board] Deliver it privately and tell the user to change it if the portal gains that feature.");
    } else {
      console.log("[board] A password was generated but not printed. Rerun with --show-password to recover it.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run only when executed directly (e.g. `npx tsx scripts/provision-board-member.ts`),
// not when imported by tests.
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
