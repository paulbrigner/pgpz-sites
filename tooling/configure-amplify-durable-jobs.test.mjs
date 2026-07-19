import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  assertAmplifyEnvironmentApplied,
  BACKGROUND_JOB_SMOKE_ALLOWLIST,
  buildAmplifyEnvironmentConfigurationPlan,
  environmentConfigurationConfirmation,
  MANAGED_BACKGROUND_JOB_ENVIRONMENT_KEYS,
  mergeAmplifyBackgroundJobEnvironment,
  summarizeAmplifyEnvironmentConfiguration,
  validateAmplifyEnvironmentInventory,
} from "./amplify-durable-jobs-environment.mjs";
import {
  buildCliPlan,
  executeCliPlan,
  parseArguments,
  redactCliPlan,
} from "./configure-amplify-durable-jobs.mjs";

const secret = "not-a-production-secret-".repeat(3);

function plan(applicationName = "community", overrides = {}) {
  return {
    ...buildAmplifyEnvironmentConfigurationPlan({
      applicationName,
      accountId: "123456789012",
      internalSecret: secret,
      enabled: "false",
    }),
    mode: "dry-run",
    ...overrides,
  };
}

function inventoryFor(currentPlan, environmentVariables = { EXISTING_SECRET: "preserve-me" }) {
  return {
    callerAccount: currentPlan.accountId,
    appResponse: {
      app: {
        appId: currentPlan.appId,
        repository: "https://github.com/paulbrigner/pgpz-sites.git",
        environmentVariables,
      },
    },
    branchResponse: {
      branch: {
        branchName: currentPlan.branchName,
        stage: "PRODUCTION",
        environmentVariables: {},
      },
    },
    stackResponse: {
      Stacks: [
        {
          StackId:
            `arn:aws:cloudformation:${currentPlan.region}:${currentPlan.accountId}:stack/${currentPlan.stackName}/identifier`,
          StackName: currentPlan.stackName,
          StackStatus: "CREATE_COMPLETE",
          EnableTerminationProtection: true,
          Outputs: [
            { OutputKey: "JobsTableName", OutputValue: currentPlan.tableName },
            { OutputKey: "QueueArn", OutputValue: currentPlan.expectedQueueArn },
            { OutputKey: "QueueUrl", OutputValue: currentPlan.expectedQueueUrl },
          ],
        },
      ],
    },
  };
}

test("pins each application, stack, and app-specific confirmation", () => {
  const community = plan("community");
  const coalition = plan("coalition");
  assert.equal(community.appId, "d2xb9ethk5a24j");
  assert.equal(community.stackName, "PgpzCommunityBackgroundJobs");
  assert.equal(coalition.appId, "d1ve1xrza71r7u");
  assert.equal(coalition.stackName, "PgpzCoalitionBackgroundJobs");
  assert.equal(
    environmentConfigurationConfirmation("coalition"),
    "CONFIGURE-COALITION-BACKGROUND-JOBS",
  );
});

test("requires a strong secret and exact guarded apply confirmation", () => {
  assert.throws(
    () =>
      buildAmplifyEnvironmentConfigurationPlan({
        applicationName: "community",
        accountId: "123456789012",
        internalSecret: "too-short",
      }),
    /at least 32 bytes/,
  );
  const parsed = parseArguments([
    "--application",
    "community",
    "--account-id",
    "123456789012",
    "--apply",
    "--confirm",
    "wrong",
  ]);
  assert.throws(
    () =>
      buildCliPlan({
        ...parsed,
        environment: { BACKGROUND_JOBS_INTERNAL_SECRET: secret },
      }),
    /requires --confirm CONFIGURE-COMMUNITY-BACKGROUND-JOBS/,
  );
  assert.throws(
    () => parseArguments(["--apply", "--dry-run"]),
    /mutually exclusive/,
  );
  assert.throws(
    () => parseArguments(["--application", "community", "--typo", "value"]),
    /Unknown option/,
  );
  assert.throws(
    () =>
      parseArguments([
        "--application",
        "community",
        "--application",
        "coalition",
      ]),
    /Duplicate option/,
  );
});

test("validates the AWS caller, pinned app and branch, and protected stack", () => {
  const currentPlan = plan();
  const inventory = validateAmplifyEnvironmentInventory({
    ...inventoryFor(currentPlan),
    plan: currentPlan,
  });
  assert.equal(inventory.tableName, currentPlan.tableName);
  assert.equal(inventory.queueUrl, currentPlan.expectedQueueUrl);

  assert.throws(
    () =>
      validateAmplifyEnvironmentInventory({
        ...inventoryFor(currentPlan),
        callerAccount: "999999999999",
        plan: currentPlan,
      }),
    /does not match --account-id/,
  );
  assert.throws(
    () =>
      validateAmplifyEnvironmentInventory({
        ...inventoryFor(currentPlan),
        appResponse: {
          app: {
            appId: currentPlan.appId,
            repository: "https://github.com/attacker/repository",
            environmentVariables: {},
          },
        },
        plan: currentPlan,
      }),
    /not connected to pgpz-sites/,
  );
  const unsafeStack = inventoryFor(currentPlan).stackResponse;
  unsafeStack.Stacks[0].EnableTerminationProtection = false;
  assert.throws(
    () =>
      validateAmplifyEnvironmentInventory({
        ...inventoryFor(currentPlan),
        stackResponse: unsafeStack,
        plan: currentPlan,
      }),
    /termination protection/,
  );

  const branchOverride = inventoryFor(currentPlan).branchResponse;
  branchOverride.branch.environmentVariables = {
    BACKGROUND_JOBS_ENABLED: "true",
  };
  assert.throws(
    () =>
      validateAmplifyEnvironmentInventory({
        ...inventoryFor(currentPlan),
        branchResponse: branchOverride,
        plan: currentPlan,
      }),
    /overrides managed background-job environment keys: BACKGROUND_JOBS_ENABLED/,
  );
});

test("merges only the five managed keys and never broadens the smoke allowlist", () => {
  const currentPlan = plan();
  const existingEnvironment = {
    DATABASE_SECRET: "unchanged",
    BACKGROUND_JOBS_ENABLED: "true",
    BACKGROUND_JOBS_TABLE: "old-table",
  };
  const desired = mergeAmplifyBackgroundJobEnvironment({
    existingEnvironment,
    plan: currentPlan,
    tableName: currentPlan.tableName,
    queueUrl: currentPlan.expectedQueueUrl,
  });
  assert.equal(desired.DATABASE_SECRET, "unchanged");
  assert.equal(desired.BACKGROUND_JOBS_ENABLED, "false");
  assert.equal(desired.BACKGROUND_JOBS_INTERNAL_SECRET, secret);
  assert.equal(
    desired.BACKGROUND_JOB_SMOKE_ALLOWLIST,
    "paul@paulbrigner.com,div@accrediv.com",
  );
  assert.equal(BACKGROUND_JOB_SMOKE_ALLOWLIST, desired.BACKGROUND_JOB_SMOKE_ALLOWLIST);
  assert.deepEqual(MANAGED_BACKGROUND_JOB_ENVIRONMENT_KEYS, [
    "BACKGROUND_JOBS_ENABLED",
    "BACKGROUND_JOBS_TABLE",
    "BACKGROUND_JOBS_QUEUE_URL",
    "BACKGROUND_JOBS_INTERNAL_SECRET",
    "BACKGROUND_JOB_SMOKE_ALLOWLIST",
  ]);
});

test("safe summaries and redacted plans contain no existing or new secret values", () => {
  const currentPlan = plan();
  const existingEnvironment = { EXISTING_SECRET: "do-not-print" };
  const desiredEnvironment = mergeAmplifyBackgroundJobEnvironment({
    existingEnvironment,
    plan: currentPlan,
    tableName: currentPlan.tableName,
    queueUrl: currentPlan.expectedQueueUrl,
  });
  const summary = summarizeAmplifyEnvironmentConfiguration({
    mode: "dry-run",
    plan: currentPlan,
    existingEnvironment,
    desiredEnvironment,
  });
  const rendered = JSON.stringify({
    summary,
    plan: redactCliPlan({ ...currentPlan, secretEnvironmentName: "TEST_SECRET" }),
  });
  assert.doesNotMatch(rendered, /do-not-print/);
  assert.doesNotMatch(rendered, new RegExp(secret));
  assert.equal(summary.preservedEnvironmentVariableCount, 1);
  assert.equal(summary.updateRequired, true);
});

test("dry run performs only read-only inventory calls", () => {
  const currentPlan = plan();
  const calls = [];
  const responses = inventoryFor(currentPlan);
  const aws = (_base, args) => {
    calls.push(args);
    const operation = args.slice(0, 2).join(" ");
    if (operation === "sts get-caller-identity") {
      return { stdout: `${responses.callerAccount}\n` };
    }
    if (operation === "amplify get-app") {
      return { stdout: JSON.stringify(responses.appResponse) };
    }
    if (operation === "amplify get-branch") {
      return { stdout: JSON.stringify(responses.branchResponse) };
    }
    if (operation === "cloudformation describe-stacks") {
      return { stdout: JSON.stringify(responses.stackResponse) };
    }
    throw new Error(`Unexpected call: ${operation}`);
  };
  const summary = executeCliPlan(currentPlan, { aws });
  assert.equal(summary.mode, "dry-run");
  assert.deepEqual(
    calls.map((args) => args.slice(0, 2).join(" ")),
    [
      "sts get-caller-identity",
      "amplify get-app",
      "amplify get-branch",
      "cloudformation describe-stacks",
    ],
  );
});

test("apply uses a private full-map input, preserves values, and never starts a build", () => {
  const currentPlan = plan("coalition", { mode: "apply" });
  const existingEnvironment = {
    EXISTING_SECRET: "preserve-without-printing",
    EMAIL_TRANSPORT: "ses",
  };
  const responses = inventoryFor(currentPlan, existingEnvironment);
  const calls = [];
  let desiredFromPrivateFile;
  let getAppCount = 0;
  const aws = (_base, args) => {
    calls.push(args);
    const operation = args.slice(0, 2).join(" ");
    if (operation === "sts get-caller-identity") {
      return { stdout: `${responses.callerAccount}\n` };
    }
    if (operation === "amplify get-app") {
      getAppCount += 1;
      return {
        stdout: JSON.stringify(
          getAppCount === 1
            ? responses.appResponse
            : {
                app: {
                  ...responses.appResponse.app,
                  environmentVariables: desiredFromPrivateFile,
                },
              },
        ),
      };
    }
    if (operation === "amplify get-branch") {
      return { stdout: JSON.stringify(responses.branchResponse) };
    }
    if (operation === "cloudformation describe-stacks") {
      return { stdout: JSON.stringify(responses.stackResponse) };
    }
    if (operation === "amplify update-app") {
      temporaryPath = args[args.indexOf("--cli-input-json") + 1].replace(
        /^file:\/\//,
        "",
      );
      assert.equal(statSync(temporaryPath).mode & 0o777, 0o600);
      desiredFromPrivateFile = JSON.parse(
        readFileSync(temporaryPath, "utf8"),
      ).environmentVariables;
      return { stdout: `${currentPlan.appId}\n` };
    }
    throw new Error(`Unexpected call: ${operation}`);
  };
  let temporaryPath;
  const summary = executeCliPlan(currentPlan, { aws });
  assert.equal(summary.mode, "applied");
  assert.equal(desiredFromPrivateFile.EXISTING_SECRET, "preserve-without-printing");
  assert.equal(desiredFromPrivateFile.BACKGROUND_JOBS_INTERNAL_SECRET, secret);
  assert.equal(desiredFromPrivateFile.BACKGROUND_JOB_SMOKE_ALLOWLIST, BACKGROUND_JOB_SMOKE_ALLOWLIST);
  assert.equal(calls.filter((args) => args[0] === "amplify" && args[1] === "update-app").length, 1);
  assert.deepEqual(
    calls.map((args) => args.slice(0, 2).join(" ")),
    [
      "sts get-caller-identity",
      "amplify get-app",
      "amplify get-branch",
      "cloudformation describe-stacks",
      "amplify update-app",
      "amplify get-app",
    ],
  );
  assert.equal(calls.some((args) => args.includes("start-job")), false);
  assert.equal(calls.some((args) => args.includes("deploy")), false);
  assert.equal(calls.some((args) => args[0] === "ses"), false);
  assert.throws(() => readFileSync(temporaryPath, "utf8"));
  assert.doesNotMatch(JSON.stringify(summary), /preserve-without-printing/);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(secret));
});

test("post-update verification refuses dropped or changed existing values", () => {
  assert.throws(
    () =>
      assertAmplifyEnvironmentApplied({
        actualEnvironment: { EXISTING: "changed" },
        desiredEnvironment: { EXISTING: "original" },
      }),
    /preserve one or more existing environment values/,
  );
});
