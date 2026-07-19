import { AMPLIFY_COMPUTE_APPLICATIONS } from "./amplify-compute-role.mjs";
import { backgroundJobsApplication } from "./durable-jobs-cloudformation.mjs";

export const BACKGROUND_JOB_SMOKE_ALLOWLIST =
  "paul@paulbrigner.com,div@accrediv.com";

export const MANAGED_BACKGROUND_JOB_ENVIRONMENT_KEYS = Object.freeze([
  "BACKGROUND_JOBS_ENABLED",
  "BACKGROUND_JOBS_TABLE",
  "BACKGROUND_JOBS_QUEUE_URL",
  "BACKGROUND_JOBS_INTERNAL_SECRET",
  "BACKGROUND_JOB_SMOKE_ALLOWLIST",
]);

const EXPECTED_REPOSITORY = "https://github.com/paulbrigner/pgpz-sites";
const STABLE_STACK_STATUSES = new Set([
  "CREATE_COMPLETE",
  "UPDATE_COMPLETE",
]);

function normalizeRepository(value) {
  return String(value || "")
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");
}

function validateEnvironmentMap(environmentVariables, label) {
  if (
    !environmentVariables ||
    typeof environmentVariables !== "object" ||
    Array.isArray(environmentVariables)
  ) {
    throw new Error(`${label} did not contain an environment-variable map`);
  }
  for (const [key, value] of Object.entries(environmentVariables)) {
    if (!key || typeof value !== "string") {
      throw new Error(`${label} contained an invalid environment-variable entry`);
    }
  }
  return environmentVariables;
}

export function amplifyEnvironmentApplication(applicationName) {
  const amplify = AMPLIFY_COMPUTE_APPLICATIONS[applicationName];
  const infrastructure = backgroundJobsApplication(applicationName);
  if (!amplify) throw new Error(`Unknown application: ${applicationName}`);
  return {
    applicationName,
    appId: amplify.appId,
    branchName: amplify.branchName,
    expectedRepository: EXPECTED_REPOSITORY,
    stackName: infrastructure.stackName,
    tableName: infrastructure.tableName,
    queueName: infrastructure.resourcePrefix,
  };
}

export function environmentConfigurationConfirmation(applicationName) {
  amplifyEnvironmentApplication(applicationName);
  return `CONFIGURE-${applicationName.toUpperCase()}-BACKGROUND-JOBS`;
}

export function buildAmplifyEnvironmentConfigurationPlan({
  applicationName,
  accountId,
  region = "us-east-1",
  enabled = "false",
  internalSecret,
}) {
  const application = amplifyEnvironmentApplication(applicationName);
  if (!/^\d{12}$/.test(accountId || "")) {
    throw new Error("accountId must contain 12 digits");
  }
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
    throw new Error("region must be an AWS region identifier");
  }
  const normalizedEnabled = String(enabled).trim().toLowerCase();
  if (!new Set(["true", "false"]).has(normalizedEnabled)) {
    throw new Error("enabled must be true or false");
  }
  if (Buffer.byteLength(internalSecret || "", "utf8") < 32) {
    throw new Error("the background-job internal secret must contain at least 32 bytes");
  }
  return {
    ...application,
    accountId,
    region,
    enabled: normalizedEnabled,
    internalSecret,
    expectedQueueArn:
      `arn:aws:sqs:${region}:${accountId}:${application.queueName}`,
    expectedQueueUrl:
      `https://sqs.${region}.amazonaws.com/${accountId}/${application.queueName}`,
  };
}

function stackOutputMap(stack) {
  if (!Array.isArray(stack.Outputs)) {
    throw new Error("CloudFormation stack did not contain outputs");
  }
  return Object.fromEntries(
    stack.Outputs.map((output) => [output.OutputKey, output.OutputValue]),
  );
}

export function validateAmplifyEnvironmentInventory({
  callerAccount,
  appResponse,
  branchResponse,
  stackResponse,
  plan,
}) {
  if (String(callerAccount || "").trim() !== plan.accountId) {
    throw new Error("The selected AWS profile does not match --account-id");
  }

  const app = appResponse?.app;
  if (!app || app.appId !== plan.appId) {
    throw new Error("Amplify did not return the pinned application");
  }
  if (
    normalizeRepository(app.repository) !==
    normalizeRepository(plan.expectedRepository)
  ) {
    throw new Error("The pinned Amplify application is not connected to pgpz-sites");
  }
  const existingEnvironment = validateEnvironmentMap(
    app.environmentVariables || {},
    "Amplify application",
  );

  const branch = branchResponse?.branch;
  if (!branch || branch.branchName !== plan.branchName) {
    throw new Error("Amplify did not return the expected main branch");
  }
  if (branch.stage !== "PRODUCTION") {
    throw new Error("The pinned Amplify main branch is not marked PRODUCTION");
  }
  const branchEnvironment = validateEnvironmentMap(
    branch.environmentVariables || {},
    "Amplify branch",
  );
  const managedBranchOverrides = MANAGED_BACKGROUND_JOB_ENVIRONMENT_KEYS.filter(
    (key) => Object.hasOwn(branchEnvironment, key),
  );
  if (managedBranchOverrides.length > 0) {
    throw new Error(
      `Amplify main branch overrides managed background-job environment keys: ${managedBranchOverrides.join(", ")}`,
    );
  }

  const stacks = stackResponse?.Stacks;
  if (!Array.isArray(stacks) || stacks.length !== 1) {
    throw new Error("CloudFormation did not return exactly one jobs stack");
  }
  const stack = stacks[0];
  if (stack.StackName !== plan.stackName) {
    throw new Error("CloudFormation returned an unexpected stack");
  }
  const expectedStackArnPrefix =
    `arn:aws:cloudformation:${plan.region}:${plan.accountId}:stack/${plan.stackName}/`;
  if (!String(stack.StackId || "").startsWith(expectedStackArnPrefix)) {
    throw new Error("The background-jobs stack belongs to an unexpected account or region");
  }
  if (!STABLE_STACK_STATUSES.has(stack.StackStatus)) {
    throw new Error("The background-jobs stack is not in a stable usable state");
  }
  if (stack.EnableTerminationProtection !== true) {
    throw new Error("The background-jobs stack must have termination protection enabled");
  }
  const outputs = stackOutputMap(stack);
  if (outputs.JobsTableName !== plan.tableName) {
    throw new Error("The background-jobs stack returned an unexpected table");
  }
  if (outputs.QueueArn !== plan.expectedQueueArn) {
    throw new Error("The background-jobs stack returned an unexpected queue ARN");
  }
  if (outputs.QueueUrl !== plan.expectedQueueUrl) {
    throw new Error("The background-jobs stack returned an unexpected queue URL");
  }

  return {
    existingEnvironment,
    tableName: outputs.JobsTableName,
    queueUrl: outputs.QueueUrl,
  };
}

export function mergeAmplifyBackgroundJobEnvironment({
  existingEnvironment,
  plan,
  tableName,
  queueUrl,
}) {
  const existing = validateEnvironmentMap(
    existingEnvironment,
    "Existing Amplify application",
  );
  return {
    ...existing,
    BACKGROUND_JOBS_ENABLED: plan.enabled,
    BACKGROUND_JOBS_TABLE: tableName,
    BACKGROUND_JOBS_QUEUE_URL: queueUrl,
    BACKGROUND_JOBS_INTERNAL_SECRET: plan.internalSecret,
    BACKGROUND_JOB_SMOKE_ALLOWLIST: BACKGROUND_JOB_SMOKE_ALLOWLIST,
  };
}

export function assertAmplifyEnvironmentApplied({
  actualEnvironment,
  desiredEnvironment,
}) {
  const actual = validateEnvironmentMap(
    actualEnvironment,
    "Updated Amplify application",
  );
  const desired = validateEnvironmentMap(
    desiredEnvironment,
    "Desired Amplify application",
  );
  const actualKeys = Object.keys(actual).sort();
  const desiredKeys = Object.keys(desired).sort();
  if (
    actualKeys.length !== desiredKeys.length ||
    actualKeys.some((key, index) => key !== desiredKeys[index])
  ) {
    throw new Error("Amplify did not preserve the complete environment-variable key set");
  }
  const mismatches = desiredKeys.filter((key) => actual[key] !== desired[key]);
  if (mismatches.length > 0) {
    const managed = mismatches.filter((key) =>
      MANAGED_BACKGROUND_JOB_ENVIRONMENT_KEYS.includes(key),
    );
    if (managed.length > 0) {
      throw new Error(
        `Amplify did not persist managed environment keys: ${managed.join(", ")}`,
      );
    }
    throw new Error("Amplify did not preserve one or more existing environment values");
  }
}

export function summarizeAmplifyEnvironmentConfiguration({
  mode,
  plan,
  existingEnvironment,
  desiredEnvironment,
}) {
  const changedManagedKeys = MANAGED_BACKGROUND_JOB_ENVIRONMENT_KEYS.filter(
    (key) => existingEnvironment[key] !== desiredEnvironment[key],
  );
  const existingKeys = Object.keys(existingEnvironment);
  const preservedKeys = existingKeys.filter(
    (key) => !MANAGED_BACKGROUND_JOB_ENVIRONMENT_KEYS.includes(key),
  );
  return {
    mode,
    applicationName: plan.applicationName,
    appId: plan.appId,
    branchName: plan.branchName,
    stackName: plan.stackName,
    accountId: plan.accountId,
    region: plan.region,
    backgroundJobsEnabled: plan.enabled,
    tableName: plan.tableName,
    queueName: plan.queueName,
    existingEnvironmentVariableCount: existingKeys.length,
    preservedEnvironmentVariableCount: preservedKeys.length,
    managedKeys: [...MANAGED_BACKGROUND_JOB_ENVIRONMENT_KEYS],
    changedManagedKeys,
    updateRequired: changedManagedKeys.length > 0,
  };
}
