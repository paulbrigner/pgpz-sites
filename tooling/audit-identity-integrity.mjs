#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  APP_TARGETS,
  APP_USER_TYPE,
  BETTER_AUTH_USER_TYPE,
  buildClaimTransaction,
  emailFingerprint,
  normalizeEmail,
  planEmailOwnershipClaims,
} from "./backfill-email-ownership-claims.mjs";

const MODEL_TYPES = Object.freeze({
  account: "BETTER_AUTH#better_auth_accounts",
  session: "BETTER_AUTH#better_auth_sessions",
  verification: "BETTER_AUTH#better_auth_verifications",
});
const REPAIR_CONFIRMATION = "REPAIR-UNAMBIGUOUS";

const readOptionValue = (argv, index, option) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
};

export function usage() {
  return [
    "Audit application and Better Auth identity integrity.",
    "",
    "Read-only (default):",
    "  node tooling/audit-identity-integrity.mjs --app community [--profile PROFILE]",
    "  node tooling/audit-identity-integrity.mjs --app coalition [--profile PROFILE]",
    "",
    "Repair only unambiguous claim/index metadata (never deletes records):",
    `  node tooling/audit-identity-integrity.mjs --app community --repair --confirm ${REPAIR_CONFIRMATION} [--profile PROFILE]`,
    "",
    "Run each app separately and rerun read-only after any repair.",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    repair: false,
    confirm: null,
    app: null,
    tableName: null,
    region: null,
    profile: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--repair":
        options.repair = true;
        break;
      case "--confirm":
        options.confirm = readOptionValue(argv, index, argument);
        index += 1;
        break;
      case "--app":
        options.app = readOptionValue(argv, index, argument).toLowerCase();
        index += 1;
        break;
      case "--table":
        options.tableName = readOptionValue(argv, index, argument);
        index += 1;
        break;
      case "--region":
        options.region = readOptionValue(argv, index, argument);
        index += 1;
        break;
      case "--profile":
        options.profile = readOptionValue(argv, index, argument);
        index += 1;
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
  if (options.repair && options.confirm !== REPAIR_CONFIRMATION) {
    throw new Error(`--repair requires --confirm ${REPAIR_CONFIRMATION}.`);
  }
  if (!options.repair && options.confirm) {
    throw new Error("--confirm is only valid with --repair.");
  }

  if (options.app) {
    if (options.tableName || options.region) {
      throw new Error("Use either --app or --table with --region, not both.");
    }
    const target = APP_TARGETS[options.app];
    if (!target) throw new Error("--app must be community or coalition.");
    options.tableName = target.tableName;
    options.region = target.region;
  } else if (!options.tableName || !options.region) {
    throw new Error("Select a target with --app, or provide both --table and --region.");
  }
  return options;
}

const recordKey = (item) =>
  item && typeof item.pk === "string" && typeof item.sk === "string"
    ? { pk: item.pk, sk: item.sk }
    : null;

const recordFingerprint = (item) =>
  createHash("sha256")
    .update(`${item?.pk || "missing"}\u0000${item?.sk || "missing"}`)
    .digest("hex")
    .slice(0, 16);

const itemId = (item) =>
  typeof item?.id === "string" && item.id.trim() ? item.id.trim() : null;

function expectedIndex(item) {
  if (item.type === APP_USER_TYPE) {
    const email = normalizeEmail(item.email);
    return email ? { GSI1PK: `USER#${email}`, GSI1SK: `USER#${email}` } : null;
  }
  if (item.type === BETTER_AUTH_USER_TYPE) {
    const email = normalizeEmail(item.email);
    const id = itemId(item);
    return email && id
      ? {
          GSI1PK: `${BETTER_AUTH_USER_TYPE}#email#${email}`,
          GSI1SK: id,
        }
      : null;
  }
  if (item.type === MODEL_TYPES.session && typeof item.token === "string" && item.token) {
    return {
      GSI1PK: `${MODEL_TYPES.session}#token#${item.token}`,
      GSI1SK: String(item.id || ""),
    };
  }
  if (
    item.type === MODEL_TYPES.account &&
    typeof item.providerId === "string" &&
    item.providerId &&
    typeof item.accountId === "string" &&
    item.accountId
  ) {
    return {
      GSI1PK: `${MODEL_TYPES.account}#provider#${item.providerId}#${item.accountId}`,
      GSI1SK: String(item.id || ""),
    };
  }
  if (
    item.type === MODEL_TYPES.verification &&
    typeof item.identifier === "string" &&
    item.identifier
  ) {
    return {
      GSI1PK: `${MODEL_TYPES.verification}#identifier#${item.identifier}`,
      GSI1SK: String(item.id || ""),
    };
  }
  return null;
}

function indexRepair(item, expected) {
  const names = { "#pk": "pk", "#type": "type", "#id": "id" };
  const values = {
    ":type": item.type,
    ":id": item.id,
    ":gsi1pk": expected.GSI1PK,
    ":gsi1sk": expected.GSI1SK,
  };
  const sourceConditions = [];
  for (const field of ["email", "token", "providerId", "accountId", "identifier"]) {
    if (typeof item[field] !== "string" || !item[field]) continue;
    names[`#source${sourceConditions.length}`] = field;
    values[`:source${sourceConditions.length}`] = item[field];
    sourceConditions.push(`#source${sourceConditions.length} = :source${sourceConditions.length}`);
  }
  return {
    kind: "index",
    item,
    request: {
      Key: recordKey(item),
      UpdateExpression: "SET GSI1PK = :gsi1pk, GSI1SK = :gsi1sk",
      ConditionExpression:
        `attribute_exists(#pk) AND #type = :type AND #id = :id${sourceConditions.length ? ` AND ${sourceConditions.join(" AND ")}` : ""}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

export function auditIdentityItems(items, tableName = "Table") {
  const issues = [];
  const betterAuthUsersById = new Map();
  const appEmails = new Set(
    items
      .filter((item) => item?.type === APP_USER_TYPE)
      .map((item) => normalizeEmail(item.email))
      .filter(Boolean),
  );
  for (const item of items) {
    if (item?.type === BETTER_AUTH_USER_TYPE && itemId(item)) {
      betterAuthUsersById.set(itemId(item), item);
    }
  }

  const claimPlan = planEmailOwnershipClaims(items);
  if (claimPlan.invalid) {
    issues.push({
      code: "invalid-identity-record",
      severity: "error",
      count: claimPlan.invalid,
      repair: null,
    });
  }
  for (const plan of claimPlan.plans) {
    if (plan.status === "ready") {
      issues.push({
        code: plan.claim ? "incomplete-email-claim" : "missing-email-claim",
        severity: "error",
        emailHash: plan.emailHash,
        repair: {
          kind: "claim",
          request: buildClaimTransaction({
            tableName,
            plan,
            now: "__REPAIR_TIMESTAMP__",
          }),
        },
      });
    } else if (plan.status === "collision") {
      issues.push({
        code: `ambiguous-${plan.reason}`,
        severity: "critical",
        emailHash: plan.emailHash,
        appUserIds: plan.appUserIds,
        betterAuthUserIds: plan.betterAuthUserIds,
        repair: null,
      });
    }
  }

  for (const item of items) {
    if (item?.type !== BETTER_AUTH_USER_TYPE) continue;
    const email = normalizeEmail(item.email);
    if (!email || appEmails.has(email)) continue;
    issues.push({
      code: "better-auth-user-without-app-user",
      severity: "warning",
      emailHash: emailFingerprint(email),
      betterAuthUserId: itemId(item),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
      // This can be transient before first session resolution, so it is always
      // a manual-review finding and never an automatic deletion.
      repair: null,
    });
  }

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const key = recordKey(item);
    const relevantType = [
      APP_USER_TYPE,
      BETTER_AUTH_USER_TYPE,
      MODEL_TYPES.account,
      MODEL_TYPES.session,
      MODEL_TYPES.verification,
    ].includes(item.type);
    if (!relevantType) continue;
    if (!key || !itemId(item)) {
      issues.push({
        code: "malformed-identity-record",
        severity: "error",
        recordHash: recordFingerprint(item),
        repair: null,
      });
      continue;
    }

    if (
      [MODEL_TYPES.account, MODEL_TYPES.session].includes(item.type) &&
      (typeof item.userId !== "string" || !item.userId)
    ) {
      issues.push({
        code: "malformed-user-reference",
        severity: "error",
        recordHash: recordFingerprint(item),
        dependentType: item.type,
        repair: null,
      });
    }

    const expected = expectedIndex(item);
    if (!expected && item.type !== APP_USER_TYPE && item.type !== BETTER_AUTH_USER_TYPE) {
      issues.push({
        code: "malformed-lookup-fields",
        severity: "error",
        recordHash: recordFingerprint(item),
        repair: null,
      });
    } else if (
      expected &&
      (item.GSI1PK !== expected.GSI1PK || item.GSI1SK !== expected.GSI1SK)
    ) {
      issues.push({
        code:
          item.type === APP_USER_TYPE || item.type === BETTER_AUTH_USER_TYPE
            ? "email-index-mismatch"
            : "lookup-index-mismatch",
        severity: "error",
        recordHash: recordFingerprint(item),
        emailHash:
          item.type === APP_USER_TYPE || item.type === BETTER_AUTH_USER_TYPE
            ? emailFingerprint(item.email)
            : undefined,
        repair: indexRepair(item, expected),
      });
    }

    if (
      [MODEL_TYPES.account, MODEL_TYPES.session, MODEL_TYPES.verification].includes(item.type) &&
      typeof item.userId === "string" &&
      item.userId &&
      !betterAuthUsersById.has(item.userId)
    ) {
      issues.push({
        code: "orphan-better-auth-dependent",
        severity: "error",
        recordHash: recordFingerprint(item),
        dependentType: item.type,
        userId: item.userId,
        // Ownership cannot be reconstructed safely; report only.
        repair: null,
      });
    }
  }

  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    issues,
    summary: {
      scanned: items.length,
      appUsers: items.filter((item) => item?.type === APP_USER_TYPE).length,
      betterAuthUsers: items.filter((item) => item?.type === BETTER_AUTH_USER_TYPE).length,
      accounts: items.filter((item) => item?.type === MODEL_TYPES.account).length,
      sessions: items.filter((item) => item?.type === MODEL_TYPES.session).length,
      verifications: items.filter((item) => item?.type === MODEL_TYPES.verification).length,
      claims: items.filter((item) => item?.type === "EMAIL_OWNERSHIP").length,
      issues: issues.length,
      critical,
      errors,
      warnings,
      blocking: critical + errors,
      repairable: issues.filter((issue) => issue.repair).length,
      manualReview: issues.filter((issue) => !issue.repair).length,
    },
  };
}

export async function runAudit({ options, dependencies, log = () => {} }) {
  const items = await dependencies.listItems();
  const initialAudit = auditIdentityItems(items, options.tableName);
  let repaired = 0;
  let repairFailed = 0;

  for (const issue of initialAudit.issues) {
    log({
      level: issue.severity,
      code: issue.code,
      emailHash: issue.emailHash,
      recordHash: issue.recordHash,
      repairable: !!issue.repair,
    });
    if (!options.repair || !issue.repair) continue;
    try {
      const repair = structuredClone(issue.repair);
      if (repair.kind === "claim") {
        const timestamp = dependencies.now();
        const values = repair.request.TransactItems[0].Update.ExpressionAttributeValues;
        values[":now"] = timestamp;
      }
      await dependencies.applyRepair(repair);
      repaired += 1;
    } catch (error) {
      repairFailed += 1;
      log({
        level: "error",
        code: "repair-failed",
        emailHash: issue.emailHash,
        recordHash: issue.recordHash,
        reason: error?.name || "Error",
      });
    }
  }
  const finalAudit = options.repair
    ? auditIdentityItems(await dependencies.listItems(), options.tableName)
    : initialAudit;
  return {
    mode: options.repair ? "repair" : "audit",
    initialIssues: initialAudit.summary.issues,
    ...finalAudit.summary,
    repaired,
    repairFailed,
  };
}

export function auditExitCode(summary) {
  return summary.blocking > 0 || summary.repairFailed > 0 ? 2 : 0;
}

export async function createAwsDependencies(options) {
  if (options.profile) process.env.AWS_PROFILE = options.profile;
  const [{ DynamoDBClient }, dynamo] = await Promise.all([
    import("@aws-sdk/client-dynamodb"),
    import("@aws-sdk/lib-dynamodb"),
  ]);
  const documentClient = dynamo.DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: options.region }),
  );
  return {
    now: () => new Date().toISOString(),
    async listItems() {
      const items = [];
      let ExclusiveStartKey;
      do {
        const result = await documentClient.send(
          new dynamo.ScanCommand({
            TableName: options.tableName,
            ConsistentRead: true,
            ProjectionExpression:
              "pk, sk, #type, id, email, appUserId, betterAuthUserId, GSI1PK, GSI1SK, userId, providerId, accountId, #token, identifier, #value, createdAt, updatedAt",
            ExpressionAttributeNames: {
              "#type": "type",
              "#token": "token",
              "#value": "value",
            },
            ExclusiveStartKey,
          }),
        );
        items.push(...(result.Items || []));
        ExclusiveStartKey = result.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return items;
    },
    async applyRepair(repair) {
      if (repair.kind === "claim") {
        await documentClient.send(new dynamo.TransactWriteCommand(repair.request));
        return;
      }
      if (repair.kind === "index") {
        await documentClient.send(
          new dynamo.UpdateCommand({ TableName: options.tableName, ...repair.request }),
        );
        return;
      }
      throw new Error("Unsupported repair operation.");
    },
  };
}

function printEvent(event) {
  const fields = [
    `level=${event.level}`,
    `code=${event.code}`,
    `repairable=${event.repairable === true}`,
  ];
  if (event.emailHash) fields.push(`emailHash=${event.emailHash}`);
  if (event.recordHash) fields.push(`recordHash=${event.recordHash}`);
  if (event.reason) fields.push(`reason=${event.reason}`);
  console.error(fields.join(" "));
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
  console.log(
    JSON.stringify({
      mode: options.repair ? "repair" : "audit",
      target: options.app || options.tableName,
      region: options.region,
    }),
  );
  const summary = await runAudit({ options, dependencies, log: printEvent });
  console.log(JSON.stringify(summary));
  if (!options.repair) console.log("Read-only audit. No DynamoDB writes were attempted.");
  return auditExitCode(summary);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(`Identity audit failed: ${error?.name || "Error"}`);
      process.exitCode = 1;
    },
  );
}
