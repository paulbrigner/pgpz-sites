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
  backgroundJobsApplication,
  buildDurableJobsStackPlan,
} from "./durable-jobs-cloudformation.mjs";

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

export function deploymentConfirmation(applicationName) {
  backgroundJobsApplication(applicationName);
  return `PROVISION-${applicationName.toUpperCase()}-BACKGROUND-JOBS`;
}

function usage() {
  return [
    "Usage:",
    "  node tooling/provision-durable-jobs.mjs --application <community|coalition>",
    "    --account-id <12-digits> [--base-url https://...] [--region us-east-1]",
    "    [--alarm-topic-arn <arn>] [--profile <profile>] [--validate-only]",
    "    [--workers-enabled <true|false>]",
    "    [--apply --confirm PROVISION-<APPLICATION>-BACKGROUND-JOBS]",
    "    [--secret-env BACKGROUND_JOBS_INTERNAL_SECRET]",
    "",
    "Default mode is a local, no-AWS dry run. --validate-only calls only",
    "cloudformation validate-template. --apply is the only mutating mode and",
    "reads the 32+ byte internal bearer secret from the named environment variable.",
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
  const directory = mkdtempSync(join(tmpdir(), "pgpz-background-jobs-"));
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

export function buildCliPlan({ values, flags, environment = process.env }) {
  if (!values.application || !values["account-id"]) {
    throw new Error(usage());
  }
  const plan = buildDurableJobsStackPlan({
    applicationName: values.application,
    baseUrl: values["base-url"],
    region: values.region || "us-east-1",
    accountId: values["account-id"],
    alarmTopicArn: values["alarm-topic-arn"] || "",
  });
  const mode = flags.has("apply")
    ? "apply"
    : flags.has("validate-only")
      ? "validate-only"
      : "dry-run";
  const confirmation = deploymentConfirmation(plan.applicationName);
  if (mode === "apply" && values.confirm !== confirmation) {
    throw new Error(`--apply requires --confirm ${confirmation}`);
  }
  const secretEnvironmentName =
    values["secret-env"] || "BACKGROUND_JOBS_INTERNAL_SECRET";
  const workersEnabled = values["workers-enabled"] || "false";
  if (!new Set(["true", "false"]).has(workersEnabled)) {
    throw new Error("--workers-enabled must be true or false");
  }
  const secret = mode === "apply" ? environment[secretEnvironmentName]?.trim() : undefined;
  if (mode === "apply" && Buffer.byteLength(secret || "", "utf8") < 32) {
    throw new Error(`${secretEnvironmentName} must contain at least 32 bytes`);
  }
  return {
    ...plan,
    mode,
    confirmation,
    profile: values.profile,
    secretEnvironmentName,
    secret,
    workersEnabled,
    terminationProtection: true,
  };
}

export function redactCliPlan(plan) {
  const { secret: _secret, template, ...safePlan } = plan;
  return { ...safePlan, template };
}

export function main(argv = process.argv.slice(2), environment = process.env) {
  const { values, flags } = parseArguments(argv);
  const plan = buildCliPlan({ values, flags, environment });

  if (plan.mode === "dry-run") {
    console.log(JSON.stringify(redactCliPlan(plan), null, 2));
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

    const overrides = [
      `ApplicationBaseUrl=${plan.baseUrl}`,
      `InternalSecret=${plan.secret}`,
      `WorkersEnabled=${plan.workersEnabled}`,
      ...(plan.alarmTopicArn ? [`AlarmTopicArn=${plan.alarmTopicArn}`] : []),
    ];
    runAws(baseArguments, [
      "cloudformation",
      "deploy",
      "--stack-name",
      plan.stackName,
      "--template-file",
      temporary.path,
      "--capabilities",
      "CAPABILITY_IAM",
      "--parameter-overrides",
      ...overrides,
      "--tags",
      "Project=pgpz",
      `Application=${plan.applicationName}`,
      "Environment=production",
      "--no-fail-on-empty-changeset",
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
    if (outputs.JobsTableName !== plan.tableName) {
      throw new Error("CloudFormation output did not contain the expected jobs table");
    }
    if (outputs.QueueArn !== plan.queueArn) {
      throw new Error("CloudFormation output did not contain the expected application queue");
    }
    console.log(
      JSON.stringify(
        {
          mode: "applied",
          applicationName: plan.applicationName,
          stackName: plan.stackName,
          terminationProtection: true,
          outputs,
        },
        null,
        2,
      ),
    );
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
