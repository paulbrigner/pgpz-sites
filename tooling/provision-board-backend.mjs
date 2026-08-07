#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BOARD_BACKEND,
  buildBoardBackendStackPlan,
} from "./board-backend-cloudformation.mjs";

const APPLY_CONFIRMATION = "PROVISION-BOARD-BACKEND";

export function parseArguments(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    if (argument === "--apply" || argument === "--validate-only") {
      flags.add(argument.slice(2));
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }
  if (flags.has("apply") && flags.has("validate-only")) {
    throw new Error("--apply and --validate-only are mutually exclusive");
  }
  return { values, flags };
}

function usage() {
  return [
    "Usage:",
    "  node tooling/provision-board-backend.mjs --account-id <12-digits>",
    "    [--region us-east-1] [--profile <profile>] [--validate-only]",
    "    [--object-lock-mode GOVERNANCE|COMPLIANCE] [--retention-days 90]",
    `    [--apply --confirm ${APPLY_CONFIRMATION}]`,
    "",
    "Default mode is a local, no-AWS dry run. --validate-only only calls",
    "cloudformation validate-template. --apply is the only mutating mode.",
  ].join("\n");
}

function runAws(baseArguments, args, { capture = false } = {}) {
  const result = spawnSync("aws", [...baseArguments, ...args], {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`AWS CLI command failed: aws ${args.slice(0, 2).join(" ")}`);
  }
  return result;
}

function parseAwsJson(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Unable to parse ${label} from the AWS CLI`);
  }
}

function writeTemporaryTemplate(template) {
  const directory = mkdtempSync(join(tmpdir(), "pgpz-board-backend-"));
  const path = join(directory, "template.json");
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  return { directory, path };
}

function stackOutputMap(result) {
  const parsed = parseAwsJson(result, "CloudFormation stack outputs");
  const outputs = parsed?.Stacks?.[0]?.Outputs;
  if (!Array.isArray(outputs)) {
    throw new Error("CloudFormation did not return stack outputs");
  }
  return Object.fromEntries(
    outputs.map((output) => [output.OutputKey, output.OutputValue]),
  );
}

export function buildCliPlan({ values, flags }) {
  if (!values["account-id"]) throw new Error(usage());
  const plan = buildBoardBackendStackPlan({
    accountId: values["account-id"],
    region: values.region || "us-east-1",
  });
  const mode = flags.has("apply")
    ? "apply"
    : flags.has("validate-only")
      ? "validate-only"
      : "dry-run";
  if (mode === "apply" && values.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`--apply requires --confirm ${APPLY_CONFIRMATION}`);
  }
  const objectLockMode = values["object-lock-mode"] || "GOVERNANCE";
  if (!new Set(["GOVERNANCE", "COMPLIANCE"]).has(objectLockMode)) {
    throw new Error("--object-lock-mode must be GOVERNANCE or COMPLIANCE");
  }
  const retentionDays = Number(values["retention-days"] || 90);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("--retention-days must be a positive integer");
  }
  return {
    ...plan,
    mode,
    profile: values.profile,
    terminationProtection: true,
    parameters: { objectLockMode, retentionDays },
  };
}

export function main(argv = process.argv.slice(2)) {
  const { values, flags } = parseArguments(argv);
  const plan = buildCliPlan({ values, flags });

  if (plan.mode === "dry-run") {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const baseArguments = [
    ...(plan.profile ? ["--profile", plan.profile] : []),
    "--region",
    plan.region,
  ];
  const temporary = writeTemporaryTemplate(plan.template);
  try {
    if (plan.mode === "validate-only") {
      runAws(baseArguments, [
        "cloudformation",
        "validate-template",
        "--template-body",
        `file://${temporary.path}`,
      ]);
      console.log(`Validated ${plan.stackName}; no resources were changed.`);
      return;
    }

    const caller = runAws(
      baseArguments,
      ["sts", "get-caller-identity", "--query", "Account", "--output", "text"],
      { capture: true },
    );
    if (caller.stdout.trim() !== plan.accountId) {
      throw new Error("The selected AWS profile does not match --account-id");
    }

    runAws(baseArguments, [
      "cloudformation",
      "deploy",
      "--stack-name",
      plan.stackName,
      "--template-file",
      temporary.path,
      "--capabilities",
      "CAPABILITY_NAMED_IAM",
      "--tags",
      "Project=pgpz",
      "Application=board",
      "Environment=production",
      "--no-fail-on-empty-changeset",
      "--parameter-overrides",
      `BoardObjectLockMode=${plan.parameters.objectLockMode}`,
      `BoardRetentionDays=${plan.parameters.retentionDays}`,
    ]);
    runAws(baseArguments, [
      "cloudformation",
      "update-termination-protection",
      "--enable-termination-protection",
      "--stack-name",
      plan.stackName,
    ]);

    const outputs = stackOutputMap(
      runAws(
        baseArguments,
        [
          "cloudformation",
          "describe-stacks",
          "--stack-name",
          plan.stackName,
          "--output",
          "json",
        ],
        { capture: true },
      ),
    );
    if (outputs.TableName !== plan.tableName || outputs.TableArn !== plan.tableArn) {
      throw new Error("CloudFormation returned an unexpected Board table");
    }
    if (outputs.ComputeRoleArn !== plan.computeRoleArn) {
      throw new Error("CloudFormation returned an unexpected Board compute role");
    }
    const requiredGovernanceOutputs = [
      "DocumentsTableName",
      "AuditTableName",
      "StagingBucket",
      "RetainedBucket",
      "AuditArchiveBucket",
      "KmsKeyArn",
      "AuditArchiverRoleArn",
    ];
    const missingGovernanceOutputs = requiredGovernanceOutputs.filter((key) => !outputs[key]);
    if (missingGovernanceOutputs.length > 0) {
      throw new Error(`CloudFormation is missing governance outputs: ${missingGovernanceOutputs.join(", ")}`);
    }

    const table = parseAwsJson(
      runAws(
        baseArguments,
        ["dynamodb", "describe-table", "--table-name", plan.tableName, "--output", "json"],
        { capture: true },
      ),
      "DynamoDB table",
    ).Table;
    const ttl = parseAwsJson(
      runAws(
        baseArguments,
        ["dynamodb", "describe-time-to-live", "--table-name", plan.tableName, "--output", "json"],
        { capture: true },
      ),
      "DynamoDB TTL status",
    ).TimeToLiveDescription;
    const backups = parseAwsJson(
      runAws(
        baseArguments,
        ["dynamodb", "describe-continuous-backups", "--table-name", plan.tableName, "--output", "json"],
        { capture: true },
      ),
      "DynamoDB backup status",
    ).ContinuousBackupsDescription;
    if (
      table?.TableStatus !== "ACTIVE" ||
      table?.DeletionProtectionEnabled !== true ||
      ttl?.TimeToLiveStatus !== "ENABLED" ||
      backups?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus !== "ENABLED"
    ) {
      throw new Error("The deployed Board table did not pass protection checks");
    }

    for (const governanceTableName of [outputs.DocumentsTableName, outputs.AuditTableName]) {
      const governanceTable = parseAwsJson(
        runAws(
          baseArguments,
          ["dynamodb", "describe-table", "--table-name", governanceTableName, "--output", "json"],
          { capture: true },
        ),
        `${governanceTableName} table`,
      ).Table;
      const governanceBackups = parseAwsJson(
        runAws(
          baseArguments,
          ["dynamodb", "describe-continuous-backups", "--table-name", governanceTableName, "--output", "json"],
          { capture: true },
        ),
        `${governanceTableName} backups`,
      ).ContinuousBackupsDescription;
      if (
        governanceTable?.TableStatus !== "ACTIVE" ||
        governanceTable?.DeletionProtectionEnabled !== true ||
        governanceBackups?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus !== "ENABLED"
      ) {
        throw new Error(`${governanceTableName} did not pass retention protection checks`);
      }
    }

    for (const bucketName of [outputs.RetainedBucket, outputs.AuditArchiveBucket]) {
      const versioning = runAws(
        baseArguments,
        ["s3api", "get-bucket-versioning", "--bucket", bucketName, "--query", "Status", "--output", "text"],
        { capture: true },
      ).stdout.trim();
      const objectLock = runAws(
        baseArguments,
        ["s3api", "get-object-lock-configuration", "--bucket", bucketName, "--query", "ObjectLockConfiguration.ObjectLockEnabled", "--output", "text"],
        { capture: true },
      ).stdout.trim();
      if (versioning !== "Enabled" || objectLock !== "Enabled") {
        throw new Error(`${bucketName} did not pass Object Lock protection checks`);
      }
    }

    console.log(JSON.stringify({
      mode: "applied",
      stackName: plan.stackName,
      terminationProtection: true,
      tableStatus: table.TableStatus,
      deletionProtection: table.DeletionProtectionEnabled,
      ttlStatus: ttl.TimeToLiveStatus,
      pointInTimeRecovery: backups.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus,
      outputs,
    }, null, 2));
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export { APPLY_CONFIRMATION, BOARD_BACKEND };
