#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  BETTER_AUTH_SESSION_TYPE,
  assertDynamoTableName,
  assertSessionRevocationConfirmation,
  buildConditionalSessionDeleteBatches,
  buildSessionScanArguments,
  collectSessionKeys,
} from "./better-auth-session-revocation.mjs";

function parseArguments(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    if (argument === "--apply") {
      flags.add("apply");
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    values[argument.slice(2)] = value;
    index += 1;
  }
  return { values, flags };
}

function usage() {
  return [
    "Usage:",
    "  node tooling/revoke-better-auth-sessions.mjs --table <name>",
    "    [--region us-east-1] [--profile profile]",
    "    [--apply --confirm REVOKE-BETTER-AUTH-SESSIONS --confirm-table <name>]",
    "",
    "Without --apply, the command performs a consistent dry-run count only.",
  ].join("\n");
}

function runAws(baseArguments, args) {
  const result = spawnSync("aws", [...baseArguments, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`AWS CLI command failed: ${result.stderr.trim() || args.slice(0, 2).join(" ")}`);
  }
  return result.stdout;
}

function parseAwsJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Unable to parse ${label} from the AWS CLI`);
  }
}

function scanSessionKeys(baseArguments, tableName) {
  const pages = [];
  let exclusiveStartKey;
  do {
    const page = parseAwsJson(
      runAws(
        baseArguments,
        buildSessionScanArguments({ tableName, exclusiveStartKey }),
      ),
      "DynamoDB session scan",
    );
    pages.push(page);
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey && Object.keys(exclusiveStartKey).length > 0);
  return collectSessionKeys(pages);
}

try {
  const { values, flags } = parseArguments(process.argv.slice(2));
  if (!values.table) throw new Error(usage());
  const tableName = assertDynamoTableName(values.table);
  const apply = flags.has("apply");
  assertSessionRevocationConfirmation({
    apply,
    confirmation: values.confirm,
    confirmedTable: values["confirm-table"],
    tableName,
  });

  const baseArguments = [
    ...(values.profile ? ["--profile", values.profile] : []),
    "--region",
    values.region || "us-east-1",
  ];
  const keys = scanSessionKeys(baseArguments, tableName);
  const batches = buildConditionalSessionDeleteBatches({ tableName, keys });
  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry-run",
      tableName,
      sessionType: BETTER_AUTH_SESSION_TYPE,
      matchedCount: keys.length,
      conditionalTransactionCount: batches.length,
    }, null, 2));
    process.exit(0);
  }

  for (const batch of batches) {
    runAws(baseArguments, [
      "dynamodb",
      "transact-write-items",
      "--transact-items",
      JSON.stringify(batch),
      "--no-cli-pager",
    ]);
  }

  const remaining = scanSessionKeys(baseArguments, tableName);
  if (remaining.length !== 0) {
    throw new Error(
      `${remaining.length} Better Auth session record(s) remain; rerun the dry run and apply command`,
    );
  }
  console.log(JSON.stringify({
    mode: "applied",
    tableName,
    sessionType: BETTER_AUTH_SESSION_TYPE,
    deletedCount: keys.length,
    remainingCount: 0,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
