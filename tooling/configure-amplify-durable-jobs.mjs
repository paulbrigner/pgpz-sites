#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertAmplifyEnvironmentApplied,
  buildAmplifyEnvironmentConfigurationPlan,
  environmentConfigurationConfirmation,
  mergeAmplifyBackgroundJobEnvironment,
  summarizeAmplifyEnvironmentConfiguration,
  validateAmplifyEnvironmentInventory,
} from "./amplify-durable-jobs-environment.mjs";

const ALLOWED_VALUE_ARGUMENTS = new Set([
  "application",
  "account-id",
  "confirm",
  "enabled",
  "profile",
  "region",
  "secret-env",
]);

export function parseArguments(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    if (argument === "--apply" || argument === "--dry-run") {
      flags.add(argument.slice(2));
      continue;
    }
    const name = argument.slice(2);
    if (!ALLOWED_VALUE_ARGUMENTS.has(name)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (Object.hasOwn(values, name)) {
      throw new Error(`Duplicate option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    values[name] = value;
    index += 1;
  }
  if (flags.has("apply") && flags.has("dry-run")) {
    throw new Error("--apply and --dry-run are mutually exclusive");
  }
  return { values, flags };
}

function usage() {
  return [
    "Usage:",
    "  node tooling/configure-amplify-durable-jobs.mjs",
    "    --application <community|coalition> --account-id <12-digits>",
    "    [--region us-east-1] [--profile profile] [--enabled true|false]",
    "    [--secret-env BACKGROUND_JOBS_INTERNAL_SECRET] [--dry-run]",
    "    [--apply --confirm CONFIGURE-<APPLICATION>-BACKGROUND-JOBS]",
    "",
    "Default mode is an AWS read-only dry run. It validates the caller, pinned",
    "Amplify app/main branch, and protected jobs stack, but prints no environment",
    "values. --apply performs one Amplify update-app call and does not start a build.",
  ].join("\n");
}

export function buildCliPlan({ values, flags, environment = process.env }) {
  if (!values.application || !values["account-id"]) {
    throw new Error(usage());
  }
  const mode = flags.has("apply") ? "apply" : "dry-run";
  const confirmation = environmentConfigurationConfirmation(values.application);
  if (mode === "apply" && values.confirm !== confirmation) {
    throw new Error(`--apply requires --confirm ${confirmation}`);
  }
  const secretEnvironmentName =
    values["secret-env"] || "BACKGROUND_JOBS_INTERNAL_SECRET";
  if (!/^[A-Z][A-Z0-9_]*$/.test(secretEnvironmentName)) {
    throw new Error("--secret-env must name an uppercase environment variable");
  }
  const internalSecret = environment[secretEnvironmentName]?.trim();
  const plan = buildAmplifyEnvironmentConfigurationPlan({
    applicationName: values.application,
    accountId: values["account-id"],
    region: values.region || "us-east-1",
    enabled: values.enabled || "false",
    internalSecret,
  });
  return {
    ...plan,
    mode,
    profile: values.profile,
    confirmation,
    secretEnvironmentName,
  };
}

export function redactCliPlan(plan) {
  const { internalSecret: _internalSecret, ...safePlan } = plan;
  return safePlan;
}

function runAws(baseArguments, args) {
  const result = spawnSync("aws", [...baseArguments, ...args], {
    encoding: "utf8",
    stdio: "pipe",
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

function writeTemporaryUpdateInput(appId, environmentVariables) {
  const directory = mkdtempSync(join(tmpdir(), "pgpz-amplify-environment-"));
  const path = join(directory, "update-app.json");
  writeFileSync(
    path,
    `${JSON.stringify({ appId, environmentVariables })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  chmodSync(path, 0o600);
  return { directory, path };
}

export function executeCliPlan(
  plan,
  { aws = runAws } = {},
) {
  const baseArguments = [
    ...(plan.profile ? ["--profile", plan.profile] : []),
    "--region",
    plan.region,
  ];
  const caller = aws(baseArguments, [
    "sts",
    "get-caller-identity",
    "--query",
    "Account",
    "--output",
    "text",
  ]).stdout.trim();
  const appResponse = parseAwsJson(
    aws(baseArguments, [
      "amplify",
      "get-app",
      "--app-id",
      plan.appId,
      "--output",
      "json",
    ]),
    "Amplify application",
  );
  const branchResponse = parseAwsJson(
    aws(baseArguments, [
      "amplify",
      "get-branch",
      "--app-id",
      plan.appId,
      "--branch-name",
      plan.branchName,
      "--output",
      "json",
    ]),
    "Amplify branch",
  );
  const stackResponse = parseAwsJson(
    aws(baseArguments, [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      plan.stackName,
      "--output",
      "json",
    ]),
    "CloudFormation stack",
  );
  const inventory = validateAmplifyEnvironmentInventory({
    callerAccount: caller,
    appResponse,
    branchResponse,
    stackResponse,
    plan,
  });
  const desiredEnvironment = mergeAmplifyBackgroundJobEnvironment({
    existingEnvironment: inventory.existingEnvironment,
    plan,
    tableName: inventory.tableName,
    queueUrl: inventory.queueUrl,
  });
  const summary = summarizeAmplifyEnvironmentConfiguration({
    mode: plan.mode,
    plan,
    existingEnvironment: inventory.existingEnvironment,
    desiredEnvironment,
  });

  if (plan.mode === "dry-run" || !summary.updateRequired) {
    return {
      ...summary,
      mode: plan.mode === "apply" ? "already-configured" : "dry-run",
    };
  }

  const temporary = writeTemporaryUpdateInput(plan.appId, desiredEnvironment);
  try {
    const updatedAppId = aws(baseArguments, [
      "amplify",
      "update-app",
      "--cli-input-json",
      `file://${temporary.path}`,
      "--query",
      "app.appId",
      "--output",
      "text",
    ]).stdout.trim();
    if (updatedAppId !== plan.appId) {
      throw new Error("Amplify did not report the expected updated application");
    }
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }

  const verifiedApp = parseAwsJson(
    aws(baseArguments, [
      "amplify",
      "get-app",
      "--app-id",
      plan.appId,
      "--output",
      "json",
    ]),
    "updated Amplify application",
  );
  if (verifiedApp?.app?.appId !== plan.appId) {
    throw new Error("Amplify verification returned an unexpected application");
  }
  assertAmplifyEnvironmentApplied({
    actualEnvironment: verifiedApp.app.environmentVariables || {},
    desiredEnvironment,
  });
  return { ...summary, mode: "applied" };
}

export function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  const parsed = parseArguments(argv);
  const plan = buildCliPlan({ ...parsed, environment });
  const summary = executeCliPlan(plan);
  console.log(JSON.stringify(summary, null, 2));
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
