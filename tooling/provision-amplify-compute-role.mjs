#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { buildAmplifyComputeRolePlan } from "./amplify-compute-role.mjs";

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
    "  node tooling/provision-amplify-compute-role.mjs --application <community|coalition>",
    "    --account-id <12-digits> --bucket <name> --ses-identity-arn <arn>",
    "    --from-address <email> [--region us-east-1] [--prefix path]",
    "    [--table name] [--profile profile] [--apply --confirm ATTACH-MAIN-COMPUTE-ROLE]",
    "",
    "Without --apply, the command prints the complete trust, permission, and branch-attachment plan.",
  ].join("\n");
}

function runAws(baseArguments, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync("aws", [...baseArguments, ...args], {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
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

function assertNoUnexpectedRolePolicies(baseArguments, plan, { allowMissingExpected }) {
  const managed = parseAwsJson(
    runAws(
      baseArguments,
      [
        "iam",
        "list-attached-role-policies",
        "--role-name",
        plan.roleName,
        "--query",
        "AttachedPolicies[].PolicyArn",
        "--output",
        "json",
      ],
      { capture: true },
    ),
    "managed role policies",
  );
  if (!Array.isArray(managed) || managed.length !== 0) {
    throw new Error("Compute role has unexpected managed policies; review them manually");
  }

  const inline = parseAwsJson(
    runAws(
      baseArguments,
      [
        "iam",
        "list-role-policies",
        "--role-name",
        plan.roleName,
        "--query",
        "PolicyNames",
        "--output",
        "json",
      ],
      { capture: true },
    ),
    "inline role policies",
  );
  const allowed = allowMissingExpected ? [[], [plan.inlinePolicyName]] : [[plan.inlinePolicyName]];
  if (!Array.isArray(inline) || !allowed.some((names) =>
    names.length === inline.length && names.every((name) => inline.includes(name)))) {
    throw new Error("Compute role has unexpected inline policies; review them manually");
  }
}

try {
  const { values, flags } = parseArguments(process.argv.slice(2));
  if (!values.application || !values["account-id"] || !values.bucket ||
      !values["ses-identity-arn"] || !values["from-address"]) {
    throw new Error(usage());
  }

  const plan = buildAmplifyComputeRolePlan({
    applicationName: values.application,
    accountId: values["account-id"],
    region: values.region || "us-east-1",
    tableName: values.table,
    bucket: values.bucket,
    prefix: values.prefix || "policy-updates/uploads",
    sesIdentityArn: values["ses-identity-arn"],
    fromAddress: values["from-address"],
  });

  if (!flags.has("apply")) {
    console.log(JSON.stringify({ mode: "dry-run", ...plan }, null, 2));
    process.exit(0);
  }
  if (values.confirm !== "ATTACH-MAIN-COMPUTE-ROLE") {
    throw new Error("--apply requires --confirm ATTACH-MAIN-COMPUTE-ROLE");
  }

  const baseArguments = [
    ...(values.profile ? ["--profile", values.profile] : []),
    "--region",
    values.region || "us-east-1",
  ];
  const caller = runAws(
    baseArguments,
    ["sts", "get-caller-identity", "--query", "Account", "--output", "text"],
    { capture: true },
  );
  if (caller.stdout.trim() !== values["account-id"]) {
    throw new Error("The selected AWS profile does not match --account-id");
  }
  const existing = runAws(
    baseArguments,
    ["iam", "get-role", "--role-name", plan.roleName, "--output", "json"],
    { capture: true, allowFailure: true },
  );
  const trustPolicy = JSON.stringify(plan.trustPolicy);

  if (existing.status === 0) {
    assertNoUnexpectedRolePolicies(baseArguments, plan, { allowMissingExpected: true });
    runAws(baseArguments, [
      "iam",
      "update-assume-role-policy",
      "--role-name",
      plan.roleName,
      "--policy-document",
      trustPolicy,
    ]);
  } else if (/NoSuchEntity/i.test(existing.stderr || "")) {
    runAws(baseArguments, [
      "iam",
      "create-role",
      "--role-name",
      plan.roleName,
      "--description",
      `${plan.applicationName} Amplify main SSR compute role`,
      "--assume-role-policy-document",
      trustPolicy,
      "--tags",
      "Key=Project,Value=pgpz",
      "Key=Environment,Value=production",
      `Key=Application,Value=${plan.applicationName}`,
    ]);
  } else {
    throw new Error("Unable to determine whether the IAM role already exists");
  }

  runAws(baseArguments, [
    "iam",
    "put-role-policy",
    "--role-name",
    plan.roleName,
    "--policy-name",
    plan.inlinePolicyName,
    "--policy-document",
    JSON.stringify(plan.permissionPolicy),
  ]);
  assertNoUnexpectedRolePolicies(baseArguments, plan, { allowMissingExpected: false });
  runAws(baseArguments, [
    "amplify",
    "update-branch",
    "--app-id",
    plan.appId,
    "--branch-name",
    plan.branchName,
    "--compute-role-arn",
    plan.roleArn,
  ]);
  const attachedRole = runAws(
    baseArguments,
    [
      "amplify",
      "get-branch",
      "--app-id",
      plan.appId,
      "--branch-name",
      plan.branchName,
      "--query",
      "branch.computeRoleArn",
      "--output",
      "text",
    ],
    { capture: true },
  ).stdout.trim();
  if (attachedRole !== plan.roleArn) {
    throw new Error("Amplify main branch did not report the expected compute role ARN");
  }
  console.log(`Provisioned ${plan.roleName} and attached it only to ${plan.appId}/main.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
