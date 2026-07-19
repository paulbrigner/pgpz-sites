import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKGROUND_JOBS_INTERNAL_PATHS,
  buildDurableJobsStackPlan,
  buildDurableJobsTemplate,
  validateApplicationBaseUrl,
} from "./durable-jobs-cloudformation.mjs";
import {
  buildCliPlan,
  deploymentConfirmation,
  parseArguments,
  redactCliPlan,
} from "./provision-durable-jobs.mjs";

test("builds isolated Community and Coalition plans", () => {
  const community = buildDurableJobsStackPlan({
    applicationName: "community",
    accountId: "123456789012",
  });
  const coalition = buildDurableJobsStackPlan({
    applicationName: "coalition",
    accountId: "123456789012",
  });

  assert.equal(community.stackName, "PgpzCommunityBackgroundJobs");
  assert.equal(community.tableName, "PGPZCommunityBackgroundJobs");
  assert.equal(community.queueName, "pgpz-community-background-jobs");
  assert.equal(coalition.stackName, "PgpzCoalitionBackgroundJobs");
  assert.equal(coalition.tableName, "PGPZCoalitionBackgroundJobs");
  assert.equal(coalition.queueName, "pgpz-coalition-background-jobs");
  assert.doesNotMatch(JSON.stringify(community.template), /PGPZCoalition/);
  assert.doesNotMatch(JSON.stringify(coalition.template), /PGPZCommunity/);
});

test("creates a protected on-demand jobs table with its listing index and TTL", () => {
  const table = buildDurableJobsTemplate({ applicationName: "community" })
    .Resources.JobsTable;

  assert.equal(table.DeletionPolicy, "Retain");
  assert.equal(table.UpdateReplacePolicy, "Retain");
  assert.equal(table.Properties.BillingMode, "PAY_PER_REQUEST");
  assert.equal(table.Properties.DeletionProtectionEnabled, true);
  assert.deepEqual(table.Properties.SSESpecification, { SSEEnabled: true });
  assert.deepEqual(table.Properties.PointInTimeRecoverySpecification, {
    PointInTimeRecoveryEnabled: true,
  });
  assert.deepEqual(table.Properties.TimeToLiveSpecification, {
    AttributeName: "expires",
    Enabled: true,
  });
  assert.deepEqual(
    table.Properties.GlobalSecondaryIndexes[0].KeySchema,
    [
      { AttributeName: "GSI1PK", KeyType: "HASH" },
      { AttributeName: "GSI1SK", KeyType: "RANGE" },
    ],
  );
});

test("uses encrypted fourteen-day queues, redrive, and a batch-one partial-failure bridge", () => {
  const template = buildDurableJobsTemplate({ applicationName: "community" });
  const queue = template.Resources.JobsQueue.Properties;
  const dlq = template.Resources.DeadLetterQueue.Properties;
  const eventSource = template.Resources.BridgeWorkerEventSource.Properties;
  const worker = template.Resources.BridgeWorkerFunction.Properties;

  assert.equal(queue.SqsManagedSseEnabled, true);
  assert.equal(dlq.SqsManagedSseEnabled, true);
  assert.equal(queue.MessageRetentionPeriod, 1_209_600);
  assert.equal(dlq.MessageRetentionPeriod, 1_209_600);
  assert.equal(dlq.RedriveAllowPolicy.redrivePermission, "byQueue");
  assert.equal(dlq.RedriveAllowPolicy.sourceQueueArns.length, 1);
  assert.equal(queue.RedrivePolicy.maxReceiveCount, 5);
  assert.equal(eventSource.BatchSize, 1);
  assert.deepEqual(eventSource.FunctionResponseTypes, ["ReportBatchItemFailures"]);
  assert.deepEqual(eventSource.Enabled, {
    "Fn::If": ["BackgroundWorkersEnabled", true, false],
  });
  assert.equal(worker.Runtime, "nodejs22.x");
  assert.equal(worker.Environment.Variables.PROCESS_PATH, BACKGROUND_JOBS_INTERNAL_PATHS.process);
  assert.match(worker.Code.ZipFile, /batchItemFailures/);
  assert.match(worker.Code.ZipFile, /authorization: "Bearer "/);
  assert.match(worker.Code.ZipFile, /x-background-job-receive-count/);
});

test("keeps the bridge consumer role free of application data and email permissions", () => {
  const template = buildDurableJobsTemplate({ applicationName: "community" });
  const policy = JSON.stringify(
    template.Resources.BridgeWorkerRole.Properties.Policies,
  );
  assert.match(policy, /sqs:ReceiveMessage/);
  assert.match(policy, /sqs:DeleteMessage/);
  assert.doesNotMatch(policy, /dynamodb:/);
  assert.doesNotMatch(policy, /ses:/);
  assert.doesNotMatch(policy, /sqs:SendMessage/);
});

test("configures a bearer-authenticated scheduled reconciler and operational alarms", () => {
  const template = buildDurableJobsTemplate({ applicationName: "coalition" });
  const reconciler = template.Resources.ReconcilerFunction.Properties;

  assert.equal(reconciler.Runtime, "nodejs22.x");
  assert.equal(
    reconciler.Environment.Variables.RECONCILE_PATH,
    BACKGROUND_JOBS_INTERNAL_PATHS.reconcile,
  );
  assert.deepEqual(reconciler.Environment.Variables.INTERNAL_SECRET, {
    Ref: "InternalSecret",
  });
  assert.equal(template.Parameters.InternalSecret.NoEcho, true);
  assert.equal(template.Parameters.InternalSecret.MinLength, 32);
  assert.equal(template.Parameters.InternalSecret.Default, undefined);
  assert.equal(
    template.Resources.ReconcileSchedule.Properties.ScheduleExpression,
    "rate(5 minutes)",
  );
  assert.deepEqual(template.Resources.ReconcileSchedule.Properties.State, {
    "Fn::If": ["BackgroundWorkersEnabled", "ENABLED", "DISABLED"],
  });
  assert.equal(template.Parameters.WorkersEnabled.Default, "false");
  assert.deepEqual(
    [
      "DeadLetterQueueAlarm",
      "OldestQueuedMessageAlarm",
      "BridgeWorkerErrorAlarm",
      "ReconcilerErrorAlarm",
    ].filter((logicalId) => template.Resources[logicalId]?.Type === "AWS::CloudWatch::Alarm"),
    [
      "DeadLetterQueueAlarm",
      "OldestQueuedMessageAlarm",
      "BridgeWorkerErrorAlarm",
      "ReconcilerErrorAlarm",
    ],
  );
});

test("rejects noncanonical or unsafe application destinations", () => {
  assert.throws(() => validateApplicationBaseUrl("http://community.pgpz.org"), /https/);
  assert.throws(
    () => validateApplicationBaseUrl("https://user:pass@community.pgpz.org"),
    /credentials/,
  );
  assert.throws(
    () =>
      buildDurableJobsStackPlan({
        applicationName: "community",
        accountId: "123456789012",
        baseUrl: "https://example.com",
      }),
    /canonical origin/,
  );
});

test("deployment tooling is nonmutating by default and requires explicit apply gates", () => {
  const parsed = parseArguments([
    "--application",
    "community",
    "--account-id",
    "123456789012",
  ]);
  const dryRun = buildCliPlan({ values: parsed.values, flags: parsed.flags, environment: {} });
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.secret, undefined);
  assert.equal(dryRun.workersEnabled, "false");
  assert.equal(dryRun.terminationProtection, true);
  assert.equal(redactCliPlan({ ...dryRun, secret: "must-not-print" }).secret, undefined);

  assert.equal(
    deploymentConfirmation("coalition"),
    "PROVISION-COALITION-BACKGROUND-JOBS",
  );
  assert.throws(
    () =>
      buildCliPlan({
        values: {
          application: "coalition",
          "account-id": "123456789012",
          confirm: "wrong",
        },
        flags: new Set(["apply"]),
        environment: { BACKGROUND_JOBS_INTERNAL_SECRET: "x".repeat(64) },
      }),
    /requires --confirm/,
  );
  assert.throws(
    () =>
      buildCliPlan({
        values: {
          application: "coalition",
          "account-id": "123456789012",
          confirm: "PROVISION-COALITION-BACKGROUND-JOBS",
        },
        flags: new Set(["apply"]),
        environment: { BACKGROUND_JOBS_INTERNAL_SECRET: "too-short" },
      }),
    /at least 32 bytes/,
  );
  assert.throws(
    () => parseArguments(["--apply", "--validate-only"]),
    /mutually exclusive/,
  );
});
