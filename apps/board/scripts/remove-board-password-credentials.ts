/**
 * Remove legacy Better Auth password credentials after the Board passwordless
 * cutover. The command is read-only unless both the apply flag and exact
 * confirmation phrase are present, and it refuses to run while password auth
 * is enabled or ambiguously configured.
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { boardAuditLedger } from "../lib/audit";

export const REMOVE_PASSWORD_CREDENTIALS_CONFIRMATION =
  "REMOVE_BOARD_PASSWORD_CREDENTIALS";

const ACCOUNT_TYPE = "BETTER_AUTH#better_auth_accounts";
const SESSION_TYPE = "BETTER_AUTH#better_auth_sessions";
const AUDIT_TRANSACTION_ITEMS = 3;
const MAX_TRANSACTION_ITEMS = 100;
const MAX_DELETE_ITEMS_PER_USER = MAX_TRANSACTION_ITEMS - AUDIT_TRANSACTION_ITEMS;
const MAX_WRITE_ATTEMPTS = 4;

export type PasswordRemovalDocumentClient = {
  scan(params: Record<string, unknown>): Promise<{
    Items?: Array<Record<string, unknown>>;
    LastEvaluatedKey?: Record<string, unknown>;
  }>;
  transactWrite(params: Record<string, unknown>): Promise<unknown>;
};

export type PasswordRemovalAuditLedger = {
  buildAppendItems(input: Record<string, unknown>): Promise<{ TransactItems: unknown[] }>;
};

export type PasswordCredentialTarget = Readonly<{
  id: string;
  userId: string;
  accountId: string | null;
  providerId: "credential";
  pk: string;
  sk: string;
  sessionCount: number;
}>;

export type PasswordCredentialRemovalOutcome = Readonly<{
  mode: "dry-run" | "apply";
  tableName: string;
  actorEmail: string | null;
  targets: PasswordCredentialTarget[];
  invalidCredentialRecords: Array<{ pk: string | null; sk: string | null; reason: string }>;
  deletedCredentialAccountIds: string[];
  revokedSessionCount: number;
  failures: Array<{ userId: string; credentialAccountIds: string[]; message: string }>;
}>;

type PhysicalRecord = Record<string, unknown> & {
  pk?: unknown;
  sk?: unknown;
  type?: unknown;
  id?: unknown;
  userId?: unknown;
  accountId?: unknown;
  providerId?: unknown;
};

function valueAfter(args: readonly string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function stringField(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : "";
}

async function scanType(
  client: PasswordRemovalDocumentClient,
  tableName: string,
  type: string,
) {
  const records: PhysicalRecord[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await client.scan({
      TableName: tableName,
      ConsistentRead: true,
      FilterExpression: "#type = :type",
      ProjectionExpression: "pk, sk, #type, id, userId, accountId, providerId",
      ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: { ":type": type },
      ...(cursor ? { ExclusiveStartKey: cursor } : {}),
    });
    records.push(...(result.Items || []));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return records.filter((record) => record.type === type);
}

function credentialTargets(
  accounts: PhysicalRecord[],
  sessions: PhysicalRecord[],
) {
  const sessionsByUser = new Map<string, PhysicalRecord[]>();
  for (const session of sessions) {
    const userId = stringField(session.userId);
    if (!userId) continue;
    const existing = sessionsByUser.get(userId) || [];
    existing.push(session);
    sessionsByUser.set(userId, existing);
  }

  const targets: PasswordCredentialTarget[] = [];
  const validRecords = new Map<string, PhysicalRecord>();
  const invalidCredentialRecords: Array<{
    pk: string | null;
    sk: string | null;
    reason: string;
  }> = [];
  for (const account of accounts.filter((record) => record.providerId === "credential")) {
    const id = stringField(account.id);
    const userId = stringField(account.userId);
    const pk = stringField(account.pk);
    const sk = stringField(account.sk);
    if (!id || !userId || !pk || !sk) {
      invalidCredentialRecords.push({
        pk: pk || null,
        sk: sk || null,
        reason: "Credential account is missing a string id, userId, pk, or sk.",
      });
      continue;
    }
    targets.push({
      id,
      userId,
      accountId: stringField(account.accountId) || null,
      providerId: "credential",
      pk,
      sk,
      sessionCount: (sessionsByUser.get(userId) || []).length,
    });
    validRecords.set(`${pk}|${sk}`, account);
  }
  targets.sort((left, right) => left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id));
  return { targets, validRecords, sessionsByUser, invalidCredentialRecords };
}

function isValidSessionForUser(session: PhysicalRecord, userId: string) {
  return !!(
    stringField(session.pk) &&
    stringField(session.sk) &&
    stringField(session.id) &&
    session.type === SESSION_TYPE &&
    session.userId === userId
  );
}

function retryableTransactionError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  return new Set([
    "TransactionCanceledException",
    "TransactionInProgressException",
    "ProvisionedThroughputExceededException",
    "ThrottlingException",
    "RequestLimitExceeded",
    "InternalServerError",
  ]).has(name);
}

async function writeWithRetry(
  client: PasswordRemovalDocumentClient,
  buildInput: () => Promise<Record<string, unknown>>,
  wait: (milliseconds: number) => Promise<void>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await client.transactWrite(await buildInput());
      return;
    } catch (error) {
      lastError = error;
      if (!retryableTransactionError(error) || attempt === MAX_WRITE_ATTEMPTS) throw error;
      await wait(25 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

export async function removeBoardPasswordCredentials(params: {
  args: string[];
  env?: Record<string, string | undefined>;
  client: PasswordRemovalDocumentClient;
  auditLedger?: PasswordRemovalAuditLedger;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<PasswordCredentialRemovalOutcome> {
  const env = params.env ?? {};
  if (env.BOARD_PASSWORD_AUTH_ENABLED?.trim().toLowerCase() !== "false") {
    throw new Error("BOARD_PASSWORD_AUTH_ENABLED=false is required before credential removal.");
  }
  const tableName = env.NEXTAUTH_TABLE?.trim();
  if (!tableName) throw new Error("NEXTAUTH_TABLE must identify the exact Board auth table.");

  const apply = params.args.includes("--apply");
  const confirmation = valueAfter(params.args, "--confirm");
  const actorEmail = valueAfter(params.args, "--actor-email")?.trim().toLowerCase() || "";
  if (apply && confirmation !== REMOVE_PASSWORD_CREDENTIALS_CONFIRMATION) {
    throw new Error(
      `Apply requires --confirm ${REMOVE_PASSWORD_CREDENTIALS_CONFIRMATION}`,
    );
  }
  if (apply && (!actorEmail.includes("@") || actorEmail.startsWith("@") || actorEmail.endsWith("@"))) {
    throw new Error("Apply requires a traceable --actor-email address.");
  }

  const [accountRecords, sessionRecords] = await Promise.all([
    scanType(params.client, tableName, ACCOUNT_TYPE),
    scanType(params.client, tableName, SESSION_TYPE),
  ]);
  const {
    targets,
    validRecords,
    sessionsByUser,
    invalidCredentialRecords,
  } = credentialTargets(accountRecords, sessionRecords);
  const baseOutcome = {
    mode: apply ? "apply" as const : "dry-run" as const,
    tableName,
    actorEmail: actorEmail || null,
    targets,
    invalidCredentialRecords,
    deletedCredentialAccountIds: [] as string[],
    revokedSessionCount: 0,
    failures: [] as Array<{
      userId: string;
      credentialAccountIds: string[];
      message: string;
    }>,
  };
  if (!apply) return baseOutcome;
  if (invalidCredentialRecords.length) {
    throw new Error("Apply refused because malformed credential account records require manual review.");
  }

  const targetGroups = new Map<string, PasswordCredentialTarget[]>();
  for (const target of targets) {
    const group = targetGroups.get(target.userId) || [];
    group.push(target);
    targetGroups.set(target.userId, group);
  }
  for (const [userId, credentials] of targetGroups) {
    const userSessions = sessionsByUser.get(userId) || [];
    if (userSessions.some((session) => !isValidSessionForUser(session, userId))) {
      throw new Error(
        `Apply refused for ${userId}: one or more session records are malformed and require manual review.`,
      );
    }
    if (credentials.length + userSessions.length > MAX_DELETE_ITEMS_PER_USER) {
      throw new Error(
        `Apply refused for ${userId}: ${credentials.length} credential account(s) and ${userSessions.length} session(s) exceed the ${MAX_DELETE_ITEMS_PER_USER}-delete ceiling reserved for ${AUDIT_TRANSACTION_ITEMS} audit transaction items.`,
      );
    }
  }

  const wait = params.wait || ((milliseconds) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const auditLedger = params.auditLedger || boardAuditLedger;
  for (const [userId, credentials] of targetGroups) {
    const sessions = sessionsByUser.get(userId) || [];
    const accountDeletes = credentials.map((target) => {
      const account = validRecords.get(`${target.pk}|${target.sk}`)!;
      return {
        Delete: {
          TableName: tableName,
          Key: { pk: target.pk, sk: target.sk },
          ConditionExpression:
            "#type = :accountType AND #providerId = :credential AND #id = :id AND #userId = :userId",
          ExpressionAttributeNames: {
            "#type": "type",
            "#providerId": "providerId",
            "#id": "id",
            "#userId": "userId",
          },
          ExpressionAttributeValues: {
            ":accountType": ACCOUNT_TYPE,
            ":credential": "credential",
            ":id": account.id,
            ":userId": userId,
          },
        },
      };
    });
    const sessionDeletes = sessions.map((session) => ({
      Delete: {
        TableName: tableName,
        Key: { pk: session.pk, sk: session.sk },
        ConditionExpression: "#type = :sessionType AND #id = :id AND #userId = :userId",
        ExpressionAttributeNames: { "#type": "type", "#id": "id", "#userId": "userId" },
        ExpressionAttributeValues: {
          ":sessionType": SESSION_TYPE,
          ":id": session.id,
          ":userId": userId,
        },
      },
    }));
    try {
      await writeWithRetry(
        params.client,
        async () => {
          const audit = await auditLedger.buildAppendItems({
            category: "account",
            action: "password_credentials_removed",
            outcome: "success",
            actor: {
              type: "authenticated",
              userId: null,
              email: actorEmail,
              role: "migration-operator",
              capabilities: ["manageBoardUsers"],
            },
            target: { type: "better_auth_user", id: userId, version: null },
            metadata: new Map<string, string | number>([
              ["credentialAccountCount", credentials.length],
              ["credentialAccountIds", credentials.map(({ id }) => id).sort().join(",")],
              ["revokedSessionCount", sessions.length],
            ]),
            idempotencyKey: `board-password-credential-removal:${userId}`,
            occurredAt: new Date().toISOString(),
          });
          if (audit.TransactItems.length !== AUDIT_TRANSACTION_ITEMS) {
            throw new Error(
              `Audit ledger returned ${audit.TransactItems.length} transaction items; expected ${AUDIT_TRANSACTION_ITEMS}.`,
            );
          }
          return {
            TransactItems: [
              ...accountDeletes,
              ...sessionDeletes,
              ...audit.TransactItems,
            ],
            ClientRequestToken: randomUUID(),
          };
        },
        wait,
      );
      baseOutcome.deletedCredentialAccountIds.push(...credentials.map(({ id }) => id));
      baseOutcome.revokedSessionCount += sessions.length;
    } catch (error) {
      baseOutcome.failures.push({
        userId,
        credentialAccountIds: credentials.map(({ id }) => id),
        message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
    }
  }
  return baseOutcome;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const region = env.REGION_AWS || env.AWS_REGION || "us-east-1";
  const client: PasswordRemovalDocumentClient = DynamoDBDocument.from(
    new DynamoDBClient({ region }),
  );
  const outcome = await removeBoardPasswordCredentials({ args, env, client });
  console.log(JSON.stringify(outcome, null, 2));
  if (outcome.mode === "dry-run") {
    console.log(
      `[board] Dry run only. Re-run with --apply --confirm ${REMOVE_PASSWORD_CREDENTIALS_CONFIRMATION} --actor-email operator@pgpz.org after reviewing every target.`,
    );
  }
  if (outcome.failures.length) {
    throw new Error(
      `Credential removal was partially applied: ${outcome.failures.length} user transaction(s) failed. Rerun the dry run before retrying.`,
    );
  }
  return outcome;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
