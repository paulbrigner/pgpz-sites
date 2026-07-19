#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const APP_TARGETS = Object.freeze({
  community: Object.freeze({ tableName: "PGPZCommunityNextAuth", region: "us-east-1" }),
  coalition: Object.freeze({ tableName: "PGPZCoalitionNextAuth", region: "us-east-1" }),
});

export const EMAIL_OWNERSHIP_TYPE = "EMAIL_OWNERSHIP";
export const APP_USER_TYPE = "USER";
export const BETTER_AUTH_USER_TYPE = "BETTER_AUTH#better_auth_users";

export const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const emailOwnershipKey = (email) => ({
  pk: `${EMAIL_OWNERSHIP_TYPE}#${normalizeEmail(email)}`,
  sk: `${EMAIL_OWNERSHIP_TYPE}#${normalizeEmail(email)}`,
});

const recordKey = (item) =>
  item && typeof item.pk === "string" && typeof item.sk === "string"
    ? { pk: item.pk, sk: item.sk }
    : null;

const readOptionValue = (argv, index, option) => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
};

export function usage() {
  return [
    "Backfill durable normalized-email ownership claims.",
    "",
    "Dry-run (default):",
    "  node tooling/backfill-email-ownership-claims.mjs --app community [--profile PROFILE]",
    "  node tooling/backfill-email-ownership-claims.mjs --app coalition [--profile PROFILE]",
    "  node tooling/backfill-email-ownership-claims.mjs --table TABLE --region REGION [--profile PROFILE]",
    "",
    "Apply only after reviewing a collision-free dry-run:",
    "  node tooling/backfill-email-ownership-claims.mjs --app community --apply [--profile PROFILE]",
    "",
    "Selectors are mutually exclusive. Run Community and Coalition separately.",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    apply: false,
    app: null,
    tableName: null,
    region: null,
    profile: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--apply":
        options.apply = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
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
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.help) return options;

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

export const emailFingerprint = (email) =>
  createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 16);

function groupRecords(items) {
  const groups = new Map();
  let invalid = 0;
  const ensureGroup = (email) => {
    if (!groups.has(email)) {
      groups.set(email, { email, appUsers: [], betterAuthUsers: [], claims: [] });
    }
    return groups.get(email);
  };

  for (const item of items) {
    if (!item || typeof item !== "object") {
      invalid += 1;
      continue;
    }
    const hasOwnershipKey =
      (typeof item.pk === "string" && item.pk.startsWith(`${EMAIL_OWNERSHIP_TYPE}#`)) ||
      (typeof item.sk === "string" && item.sk.startsWith(`${EMAIL_OWNERSHIP_TYPE}#`));
    if (hasOwnershipKey && item.type !== EMAIL_OWNERSHIP_TYPE) {
      invalid += 1;
      continue;
    }
    if (![APP_USER_TYPE, BETTER_AUTH_USER_TYPE, EMAIL_OWNERSHIP_TYPE].includes(item.type)) {
      continue;
    }
    const email = normalizeEmail(item.email);
    if (!email || !recordKey(item)) {
      invalid += 1;
      continue;
    }
    const group = ensureGroup(email);
    if (item.type === APP_USER_TYPE) group.appUsers.push(item);
    else if (item.type === BETTER_AUTH_USER_TYPE) group.betterAuthUsers.push(item);
    else group.claims.push(item);
  }
  return { groups, invalid };
}

const recordId = (item) =>
  typeof item?.id === "string" && item.id.trim() ? item.id.trim() : null;

function collision(group, reason) {
  return {
    status: "collision",
    reason,
    email: group.email,
    emailHash: emailFingerprint(group.email),
    appUserIds: group.appUsers.map(recordId).filter(Boolean),
    betterAuthUserIds: group.betterAuthUsers.map(recordId).filter(Boolean),
    claimKeys: group.claims.map(recordKey).filter(Boolean),
  };
}

export function planEmailOwnershipClaims(items) {
  const { groups, invalid } = groupRecords(items);
  const plans = [];

  for (const group of groups.values()) {
    const appIds = group.appUsers.map(recordId);
    const betterAuthIds = group.betterAuthUsers.map(recordId);
    if (appIds.some((id) => !id) || betterAuthIds.some((id) => !id)) {
      plans.push(collision(group, "identity-missing-id"));
      continue;
    }
    if (group.appUsers.length > 1) {
      plans.push(collision(group, "duplicate-app-email"));
      continue;
    }
    if (group.betterAuthUsers.length > 1) {
      plans.push(collision(group, "duplicate-better-auth-email"));
      continue;
    }
    if (group.claims.length > 1) {
      plans.push(collision(group, "duplicate-claim-email"));
      continue;
    }

    const appUser = group.appUsers[0] || null;
    const betterAuthUser = group.betterAuthUsers[0] || null;
    const claim = group.claims[0] || null;
    const appUserId = recordId(appUser);
    const betterAuthUserId = recordId(betterAuthUser);
    if (!appUserId && !betterAuthUserId) {
      plans.push(collision(group, "claim-without-identity"));
      continue;
    }

    const expectedKey = emailOwnershipKey(group.email);
    if (
      claim &&
      (claim.pk !== expectedKey.pk ||
        claim.sk !== expectedKey.sk ||
        claim.type !== EMAIL_OWNERSHIP_TYPE ||
        normalizeEmail(claim.email) !== group.email)
    ) {
      plans.push(collision(group, "malformed-claim"));
      continue;
    }
    if (
      claim &&
      ((claim.appUserId && claim.appUserId !== appUserId) ||
        (claim.betterAuthUserId && claim.betterAuthUserId !== betterAuthUserId))
    ) {
      plans.push(collision(group, "claim-owner-mismatch"));
      continue;
    }

    const alreadyComplete =
      !!claim &&
      (claim.appUserId || null) === (appUserId || null) &&
      (claim.betterAuthUserId || null) === (betterAuthUserId || null);
    plans.push({
      status: alreadyComplete ? "already-claimed" : "ready",
      email: group.email,
      emailHash: emailFingerprint(group.email),
      appUser,
      betterAuthUser,
      claim,
      appUserId,
      betterAuthUserId,
    });
  }

  return { plans, invalid };
}

export function buildClaimTransaction({ tableName, plan, now }) {
  if (plan.status !== "ready") throw new Error("Only ready plans can be applied.");
  const names = {
    "#pk": "pk",
    "#type": "type",
    "#email": "email",
    "#appUserId": "appUserId",
    "#betterAuthUserId": "betterAuthUserId",
    "#createdAt": "createdAt",
    "#updatedAt": "updatedAt",
  };
  const values = {
    ":type": EMAIL_OWNERSHIP_TYPE,
    ":email": plan.email,
    ":now": now,
    ...(plan.appUserId ? { ":appUserId": plan.appUserId } : {}),
    ...(plan.betterAuthUserId ? { ":betterAuthUserId": plan.betterAuthUserId } : {}),
  };
  const conditions = [
    "(attribute_not_exists(#pk) OR #type = :type)",
    "(attribute_not_exists(#email) OR #email = :email)",
    plan.appUserId
      ? "(attribute_not_exists(#appUserId) OR #appUserId = :appUserId)"
      : "attribute_not_exists(#appUserId)",
    plan.betterAuthUserId
      ? "(attribute_not_exists(#betterAuthUserId) OR #betterAuthUserId = :betterAuthUserId)"
      : "attribute_not_exists(#betterAuthUserId)",
  ];
  const assignments = [
    "#type = :type",
    "#email = :email",
    "#createdAt = if_not_exists(#createdAt, :now)",
    "#updatedAt = :now",
    ...(plan.appUserId ? ["#appUserId = :appUserId"] : []),
    ...(plan.betterAuthUserId ? ["#betterAuthUserId = :betterAuthUserId"] : []),
  ];
  const TransactItems = [
    {
      Update: {
        TableName: tableName,
        Key: emailOwnershipKey(plan.email),
        UpdateExpression: `SET ${assignments.join(", ")}`,
        ConditionExpression: conditions.join(" AND "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    },
  ];

  for (const [item, type, id] of [
    [plan.appUser, APP_USER_TYPE, plan.appUserId],
    [plan.betterAuthUser, BETTER_AUTH_USER_TYPE, plan.betterAuthUserId],
  ]) {
    if (!item || !id) continue;
    TransactItems.push({
      ConditionCheck: {
        TableName: tableName,
        Key: recordKey(item),
        ConditionExpression: "attribute_exists(#pk) AND #type = :recordType AND #id = :id AND #email = :recordEmail",
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#type": "type",
          "#id": "id",
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":recordType": type,
          ":id": id,
          ":recordEmail": item.email,
        },
      },
    });
  }
  return { TransactItems };
}

const emptySummary = (mode) => ({
  mode,
  scanned: 0,
  identityEmails: 0,
  planned: 0,
  claimed: 0,
  alreadyClaimed: 0,
  collisions: 0,
  invalid: 0,
  failed: 0,
});

export async function runBackfill({ options, dependencies, log = () => {} }) {
  const summary = emptySummary(options.apply ? "apply" : "dry-run");
  const items = await dependencies.listItems();
  summary.scanned = items.length;
  const { plans, invalid } = planEmailOwnershipClaims(items);
  summary.invalid = invalid;
  summary.identityEmails = plans.length;
  const applyBlocked =
    options.apply &&
    (invalid > 0 || plans.some((plan) => plan.status === "collision"));

  for (const plan of plans) {
    if (plan.status === "collision") {
      summary.collisions += 1;
      log({
        level: "collision",
        reason: plan.reason,
        emailHash: plan.emailHash,
        appUserIds: plan.appUserIds,
        betterAuthUserIds: plan.betterAuthUserIds,
      });
      continue;
    }
    if (plan.status === "already-claimed") {
      summary.alreadyClaimed += 1;
      continue;
    }
    summary.planned += 1;
    if (!options.apply || applyBlocked) continue;

    try {
      await dependencies.applyClaim(
        buildClaimTransaction({
          tableName: options.tableName,
          plan,
          now: dependencies.now(),
        }),
      );
      summary.claimed += 1;
    } catch (error) {
      summary.failed += 1;
      log({
        level: "error",
        reason:
          error?.name === "TransactionCanceledException"
            ? "identity-changed-during-apply"
            : "claim-write-failed",
        emailHash: plan.emailHash,
      });
    }
  }
  return summary;
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
            ProjectionExpression:
              "pk, sk, #type, id, email, appUserId, betterAuthUserId, GSI1PK, GSI1SK, userId, providerId, accountId, #token, identifier, #value",
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
    async applyClaim(transaction) {
      await documentClient.send(new dynamo.TransactWriteCommand(transaction));
    },
  };
}

function printEvent(event) {
  const fields = [
    `level=${event.level}`,
    `reason=${event.reason}`,
    `emailHash=${event.emailHash}`,
  ];
  if (event.appUserIds?.length) fields.push(`appUsers=${event.appUserIds.join(",")}`);
  if (event.betterAuthUserIds?.length) {
    fields.push(`betterAuthUsers=${event.betterAuthUserIds.join(",")}`);
  }
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
      mode: options.apply ? "apply" : "dry-run",
      target: options.app || options.tableName,
      region: options.region,
    }),
  );
  const summary = await runBackfill({ options, dependencies, log: printEvent });
  console.log(JSON.stringify(summary));
  if (!options.apply) console.log("Dry-run only. No DynamoDB writes were attempted.");
  return summary.collisions || summary.invalid || summary.failed ? 2 : 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(`Email-ownership backfill failed: ${error?.name || "Error"}`);
      process.exitCode = 1;
    },
  );
}
