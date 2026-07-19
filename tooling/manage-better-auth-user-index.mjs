#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const EXPECTED_ACCOUNT_ID = "860091316962";
export const INDEX_NAME = "GSI2";
export const APP_TARGETS = Object.freeze({
  community: Object.freeze({
    tableName: "PGPZCommunityNextAuth",
    region: "us-east-1",
    accountId: EXPECTED_ACCOUNT_ID,
  }),
  coalition: Object.freeze({
    tableName: "PGPZCoalitionNextAuth",
    region: "us-east-1",
    accountId: EXPECTED_ACCOUNT_ID,
  }),
});

export const OWNED_MODEL_TYPES = new Set([
  "BETTER_AUTH#better_auth_sessions",
  "BETTER_AUTH#better_auth_accounts",
]);

const readValue = (argv, index, option) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
};

export function confirmationFor(app, phase) {
  if (!APP_TARGETS[app]) throw new Error("--app must be community or coalition.");
  if (!new Set(["schema", "backfill"]).has(phase)) {
    throw new Error("--phase must be schema or backfill.");
  }
  return `${phase === "schema" ? "ENSURE" : "BACKFILL"}-${app.toUpperCase()}-BETTER-AUTH-GSI2`;
}

export function usage() {
  return [
    "Manage the Better Auth reverse-user GSI2 migration.",
    "",
    "Read-only dry run (default):",
    "  node tooling/manage-better-auth-user-index.mjs --app <community|coalition>",
    "    --phase <schema|backfill> [--profile PROFILE]",
    "",
    "Guarded apply examples:",
    "  node tooling/manage-better-auth-user-index.mjs --app community --phase schema",
    "    --apply --confirm ENSURE-COMMUNITY-BETTER-AUTH-GSI2 [--profile PROFILE]",
    "  node tooling/manage-better-auth-user-index.mjs --app community --phase backfill",
    "    --apply --confirm BACKFILL-COMMUNITY-BETTER-AUTH-GSI2 [--profile PROFILE]",
    "",
    "The target table, region, and AWS account are pinned. Run schema before backfill,",
    "and run both phases separately for Community and Coalition.",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    app: null,
    phase: null,
    profile: null,
    apply: false,
    confirm: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--app":
        options.app = readValue(argv, index, argument).toLowerCase();
        index += 1;
        break;
      case "--phase":
        options.phase = readValue(argv, index, argument).toLowerCase();
        index += 1;
        break;
      case "--profile":
        options.profile = readValue(argv, index, argument);
        index += 1;
        break;
      case "--confirm":
        options.confirm = readValue(argv, index, argument);
        index += 1;
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.help) return options;
  if (!APP_TARGETS[options.app]) throw new Error("--app must be community or coalition.");
  if (!new Set(["schema", "backfill"]).has(options.phase)) {
    throw new Error("--phase must be schema or backfill.");
  }
  const confirmation = confirmationFor(options.app, options.phase);
  if (options.apply && options.confirm !== confirmation) {
    throw new Error(`--apply requires --confirm ${confirmation}.`);
  }
  if (!options.apply && options.confirm) throw new Error("--confirm is only valid with --apply.");
  return {
    ...options,
    ...APP_TARGETS[options.app],
    confirmation,
  };
}

const hasKeySchema = (schema, hash, range) => {
  if (!Array.isArray(schema)) return false;
  return schema.some((key) => key.AttributeName === hash && key.KeyType === "HASH") &&
    schema.some((key) => key.AttributeName === range && key.KeyType === "RANGE");
};

const expectedTableArn = (options) =>
  `arn:aws:dynamodb:${options.region}:${options.accountId}:table/${options.tableName}`;

export function validateTable({ table, callerAccount, options, requireActiveIndex = false }) {
  if (callerAccount !== options.accountId) {
    throw new Error("The selected AWS credentials do not match the pinned production account.");
  }
  if (!table || table.TableName !== options.tableName || table.TableArn !== expectedTableArn(options)) {
    throw new Error("DynamoDB returned a table outside the pinned production target.");
  }
  if (table.BillingModeSummary?.BillingMode !== "PAY_PER_REQUEST") {
    throw new Error(`${options.tableName} must use PAY_PER_REQUEST before this migration.`);
  }
  if (!hasKeySchema(table.KeySchema, "pk", "sk")) {
    throw new Error(`${options.tableName} does not have the expected pk/sk primary key.`);
  }
  const gsi1 = table.GlobalSecondaryIndexes?.find((index) => index.IndexName === "GSI1");
  if (!gsi1 || !hasKeySchema(gsi1.KeySchema, "GSI1PK", "GSI1SK") ||
    gsi1.Projection?.ProjectionType !== "ALL") {
    throw new Error(`${options.tableName} does not have the expected GSI1 schema.`);
  }
  const gsi2 = table.GlobalSecondaryIndexes?.find((index) => index.IndexName === INDEX_NAME);
  if (gsi2 && (!hasKeySchema(gsi2.KeySchema, "GSI2PK", "GSI2SK") ||
    gsi2.Projection?.ProjectionType !== "ALL")) {
    throw new Error(`${options.tableName} has an incompatible GSI2.`);
  }
  if (requireActiveIndex && (table.TableStatus !== "ACTIVE" || gsi2?.IndexStatus !== "ACTIVE")) {
    throw new Error(`${options.tableName} GSI2 must be ACTIVE before backfill.`);
  }
  return { gsi2: gsi2 || null };
}

export function gsi2CreateInput(tableName) {
  return {
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: "GSI2PK", AttributeType: "S" },
      { AttributeName: "GSI2SK", AttributeType: "S" },
    ],
    GlobalSecondaryIndexUpdates: [{
      Create: {
        IndexName: INDEX_NAME,
        KeySchema: [
          { AttributeName: "GSI2PK", KeyType: "HASH" },
          { AttributeName: "GSI2SK", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    }],
  };
}

export async function runSchema({ options, dependencies }) {
  const callerAccount = await dependencies.callerAccount();
  const table = await dependencies.describeTable();
  const { gsi2 } = validateTable({ table, callerAccount, options });
  if (!gsi2 && table.TableStatus !== "ACTIVE") {
    throw new Error(`${options.tableName} must be ACTIVE before creating GSI2.`);
  }
  const action = gsi2 ? (gsi2.IndexStatus === "ACTIVE" ? "already-active" : "wait") : "create";
  if (!options.apply) return { mode: "dry-run", phase: "schema", action };

  if (!gsi2) await dependencies.createIndex(gsi2CreateInput(options.tableName));
  const activeTable = await dependencies.waitForActiveIndex();
  validateTable({ table: activeTable, callerAccount, options, requireActiveIndex: true });
  return {
    mode: "apply",
    phase: "schema",
    action: gsi2 ? "validated" : "created",
    indexStatus: "ACTIVE",
  };
}

const text = (value) => typeof value === "string" && value.trim() ? value.trim() : "";

export function expectedUserIndex(item) {
  const type = text(item?.type);
  const id = text(item?.id);
  const userId = text(item?.userId);
  if (!OWNED_MODEL_TYPES.has(type) || !id || !userId) return null;
  return {
    GSI2PK: `${type}#userId#${userId}`,
    GSI2SK: id,
  };
}

const recordFingerprint = (item) =>
  createHash("sha256").update(`${text(item?.pk)}|${text(item?.sk)}`).digest("hex").slice(0, 16);

export function planBackfill(items) {
  const ready = [];
  let indexed = 0;
  let invalid = 0;
  const invalidFingerprints = [];
  for (const item of items) {
    if (!OWNED_MODEL_TYPES.has(item?.type)) continue;
    const expected = expectedUserIndex(item);
    const canonicalKey = expected && `${item.type}#${item.id}`;
    const hasValidPhysicalKey = canonicalKey && item.pk === canonicalKey && item.sk === canonicalKey;
    const existingTypesValid =
      (item.GSI2PK === undefined || typeof item.GSI2PK === "string") &&
      (item.GSI2SK === undefined || typeof item.GSI2SK === "string");
    if (!expected || !hasValidPhysicalKey || !existingTypesValid) {
      invalid += 1;
      invalidFingerprints.push(recordFingerprint(item));
      continue;
    }
    if (item.GSI2PK === expected.GSI2PK && item.GSI2SK === expected.GSI2SK) {
      indexed += 1;
      continue;
    }
    ready.push({ item, expected });
  }
  return { ready, indexed, invalid, invalidFingerprints };
}

export function buildBackfillUpdate(tableName, plan) {
  const { item, expected } = plan;
  const names = {
    "#type": "type",
    "#id": "id",
    "#userId": "userId",
    "#gsi2pk": "GSI2PK",
    "#gsi2sk": "GSI2SK",
  };
  const values = {
    ":type": item.type,
    ":id": item.id,
    ":userId": item.userId,
    ":gsi2pk": expected.GSI2PK,
    ":gsi2sk": expected.GSI2SK,
  };
  const conditions = ["#type = :type", "#id = :id", "#userId = :userId"];
  if (item.GSI2PK === undefined) conditions.push("attribute_not_exists(#gsi2pk)");
  else {
    conditions.push("#gsi2pk = :oldGsi2pk");
    values[":oldGsi2pk"] = item.GSI2PK;
  }
  if (item.GSI2SK === undefined) conditions.push("attribute_not_exists(#gsi2sk)");
  else {
    conditions.push("#gsi2sk = :oldGsi2sk");
    values[":oldGsi2sk"] = item.GSI2SK;
  }
  return {
    TableName: tableName,
    Key: { pk: item.pk, sk: item.sk },
    UpdateExpression: "SET #gsi2pk = :gsi2pk, #gsi2sk = :gsi2sk",
    ConditionExpression: conditions.join(" AND "),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

export async function runBackfill({ options, dependencies, log = () => {} }) {
  const callerAccount = await dependencies.callerAccount();
  const table = await dependencies.describeTable();
  validateTable({ table, callerAccount, options, requireActiveIndex: true });
  const items = await dependencies.listOwnedRecords();
  const plan = planBackfill(items);
  const summary = {
    mode: options.apply ? "apply" : "dry-run",
    phase: "backfill",
    scannedOwnedRecords: items.length,
    alreadyIndexed: plan.indexed,
    planned: plan.ready.length,
    invalid: plan.invalid,
    updated: 0,
    failed: 0,
  };
  for (const fingerprint of plan.invalidFingerprints) {
    log({ level: "invalid", recordHash: fingerprint });
  }
  if (plan.invalid || !options.apply) return summary;

  for (const record of plan.ready) {
    try {
      await dependencies.applyUpdate(buildBackfillUpdate(options.tableName, record));
      summary.updated += 1;
    } catch (error) {
      summary.failed += 1;
      log({
        level: "error",
        reason: error?.name === "ConditionalCheckFailedException"
          ? "record-changed-during-backfill"
          : "index-key-write-failed",
        recordHash: recordFingerprint(record.item),
      });
    }
  }
  return summary;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function createAwsDependencies(options) {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
  const [dynamo, document] = await Promise.all([
    import("@aws-sdk/client-dynamodb"),
    import("@aws-sdk/lib-dynamodb"),
  ]);
  const lowLevelClient = new dynamo.DynamoDBClient({ region: options.region });
  const documentClient = document.DynamoDBDocumentClient.from(lowLevelClient, {
    marshallOptions: { removeUndefinedValues: true },
  });
  const describeTable = async () => {
    const result = await lowLevelClient.send(new dynamo.DescribeTableCommand({
      TableName: options.tableName,
    }));
    return result.Table;
  };
  return {
    async callerAccount() {
      const result = spawnSync("aws", [
        ...(options.profile ? ["--profile", options.profile] : []),
        "--region",
        options.region,
        "sts",
        "get-caller-identity",
        "--query",
        "Account",
        "--output",
        "text",
      ], { encoding: "utf8", stdio: "pipe" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error("Unable to verify the selected AWS account.");
      return result.stdout.trim();
    },
    describeTable,
    async createIndex(input) {
      await lowLevelClient.send(new dynamo.UpdateTableCommand(input));
    },
    async waitForActiveIndex() {
      for (let attempt = 0; attempt < 360; attempt += 1) {
        const table = await describeTable();
        const gsi2 = table?.GlobalSecondaryIndexes?.find((index) => index.IndexName === INDEX_NAME);
        if (table?.TableStatus === "ACTIVE" && gsi2?.IndexStatus === "ACTIVE") return table;
        if (gsi2?.IndexStatus === "DELETING") throw new Error("GSI2 is being deleted.");
        await sleep(5_000);
      }
      throw new Error(`${options.tableName} GSI2 did not become ACTIVE within 30 minutes.`);
    },
    async listOwnedRecords() {
      const items = [];
      let ExclusiveStartKey;
      do {
        const result = await documentClient.send(new document.ScanCommand({
          TableName: options.tableName,
          ConsistentRead: true,
          FilterExpression: "#type IN (:sessionType, :accountType)",
          ProjectionExpression: "pk, sk, #type, id, userId, GSI2PK, GSI2SK",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: {
            ":sessionType": "BETTER_AUTH#better_auth_sessions",
            ":accountType": "BETTER_AUTH#better_auth_accounts",
          },
          ExclusiveStartKey,
        }));
        items.push(...(result.Items || []));
        ExclusiveStartKey = result.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return items;
    },
    async applyUpdate(input) {
      await documentClient.send(new document.UpdateCommand(input));
    },
  };
}

function printEvent(event) {
  console.error(Object.entries(event).map(([key, value]) => `${key}=${value}`).join(" "));
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return 1;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const dependencies = await createAwsDependencies(options);
  const summary = options.phase === "schema"
    ? await runSchema({ options, dependencies })
    : await runBackfill({ options, dependencies, log: printEvent });
  console.log(JSON.stringify({
    ...summary,
    app: options.app,
    tableName: options.tableName,
    region: options.region,
    accountId: options.accountId,
  }));
  if (!options.apply) console.log("Dry-run only. No DynamoDB writes were attempted.");
  return summary.invalid || summary.failed ? 2 : 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().then(
    (exitCode) => { process.exitCode = exitCode; },
    (error) => {
      console.error(`Better Auth GSI2 migration failed: ${error?.message || error?.name || "Error"}`);
      process.exitCode = 1;
    },
  );
}
