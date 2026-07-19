import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_TARGETS,
  buildBackfillUpdate,
  confirmationFor,
  gsi2CreateInput,
  parseArgs,
  planBackfill,
  runBackfill,
  runSchema,
  validateTable,
} from "./manage-better-auth-user-index.mjs";

const options = (overrides = {}) => ({
  app: "community",
  phase: "schema",
  profile: "test",
  apply: false,
  confirm: null,
  confirmation: confirmationFor("community", "schema"),
  ...APP_TARGETS.community,
  ...overrides,
});

const table = (overrides = {}) => ({
  TableName: "PGPZCommunityNextAuth",
  TableArn: "arn:aws:dynamodb:us-east-1:860091316962:table/PGPZCommunityNextAuth",
  TableStatus: "ACTIVE",
  BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" },
  KeySchema: [
    { AttributeName: "pk", KeyType: "HASH" },
    { AttributeName: "sk", KeyType: "RANGE" },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: "GSI1",
      IndexStatus: "ACTIVE",
      KeySchema: [
        { AttributeName: "GSI1PK", KeyType: "HASH" },
        { AttributeName: "GSI1SK", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
    {
      IndexName: "GSI2",
      IndexStatus: "ACTIVE",
      KeySchema: [
        { AttributeName: "GSI2PK", KeyType: "HASH" },
        { AttributeName: "GSI2SK", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
  ...overrides,
});

const session = (id, userId, overrides = {}) => ({
  pk: `BETTER_AUTH#better_auth_sessions#${id}`,
  sk: `BETTER_AUTH#better_auth_sessions#${id}`,
  type: "BETTER_AUTH#better_auth_sessions",
  id,
  userId,
  ...overrides,
});

const account = (id, userId, overrides = {}) => ({
  pk: `BETTER_AUTH#better_auth_accounts#${id}`,
  sk: `BETTER_AUTH#better_auth_accounts#${id}`,
  type: "BETTER_AUTH#better_auth_accounts",
  id,
  userId,
  ...overrides,
});

test("pins app, table, region, account, phase, and exact apply confirmation", () => {
  const dryRun = parseArgs(["--app", "community", "--phase", "schema"]);
  assert.equal(dryRun.apply, false);
  assert.equal(dryRun.tableName, "PGPZCommunityNextAuth");
  assert.equal(dryRun.accountId, "860091316962");
  assert.throws(() => parseArgs(["--app", "both", "--phase", "schema"]), /community or coalition/);
  assert.throws(() => parseArgs(["--app", "community", "--phase", "all"]), /schema or backfill/);
  assert.throws(
    () => parseArgs(["--app", "community", "--phase", "schema", "--apply", "--confirm", "yes"]),
    /ENSURE-COMMUNITY-BETTER-AUTH-GSI2/,
  );
  const apply = parseArgs([
    "--app", "coalition", "--phase", "backfill", "--apply", "--confirm",
    "BACKFILL-COALITION-BETTER-AUTH-GSI2",
  ]);
  assert.equal(apply.apply, true);
  assert.equal(apply.tableName, "PGPZCoalitionNextAuth");
});

test("validates the exact account, table ARN, PAY_PER_REQUEST mode, and both index schemas", () => {
  const target = options();
  assert.equal(validateTable({ table: table(), callerAccount: target.accountId, options: target }).gsi2.IndexStatus, "ACTIVE");
  assert.throws(
    () => validateTable({ table: table(), callerAccount: "123456789012", options: target }),
    /pinned production account/,
  );
  assert.throws(
    () => validateTable({ table: table({ TableArn: "arn:aws:dynamodb:us-east-1:860091316962:table/Other" }), callerAccount: target.accountId, options: target }),
    /outside the pinned production target/,
  );
  assert.throws(
    () => validateTable({ table: table({ BillingModeSummary: { BillingMode: "PROVISIONED" } }), callerAccount: target.accountId, options: target }),
    /PAY_PER_REQUEST/,
  );
  const wrongGsi = table();
  wrongGsi.GlobalSecondaryIndexes[1].Projection = { ProjectionType: "KEYS_ONLY" };
  assert.throws(
    () => validateTable({ table: wrongGsi, callerAccount: target.accountId, options: target }),
    /incompatible GSI2/,
  );
});

test("schema dry-run is read-only and guarded apply creates then validates active GSI2", async () => {
  const withoutGsi2 = table({ GlobalSecondaryIndexes: [table().GlobalSecondaryIndexes[0]] });
  let creates = 0;
  const dependencies = {
    callerAccount: async () => "860091316962",
    describeTable: async () => withoutGsi2,
    createIndex: async (input) => {
      creates += 1;
      assert.deepEqual(input, gsi2CreateInput("PGPZCommunityNextAuth"));
    },
    waitForActiveIndex: async () => table(),
  };
  assert.deepEqual(
    await runSchema({ options: options(), dependencies }),
    { mode: "dry-run", phase: "schema", action: "create" },
  );
  assert.equal(creates, 0);

  const summary = await runSchema({
    options: options({ apply: true }),
    dependencies,
  });
  assert.equal(creates, 1);
  assert.deepEqual(summary, {
    mode: "apply",
    phase: "schema",
    action: "created",
    indexStatus: "ACTIVE",
  });
});

test("plans sparse index keys only for canonical session/account records", () => {
  const records = [
    session("session-1", "user-1"),
    account("account-1", "user-1", {
      GSI2PK: "BETTER_AUTH#better_auth_accounts#userId#user-1",
      GSI2SK: "account-1",
    }),
    session("session-bad", "", {}),
    session("session-wrong-key", "user-2", { pk: "wrong" }),
    { type: "USER", id: "app-user", userId: "ignored" },
  ];
  const plan = planBackfill(records);
  assert.equal(plan.ready.length, 1);
  assert.equal(plan.indexed, 1);
  assert.equal(plan.invalid, 2);
  assert.deepEqual(plan.ready[0].expected, {
    GSI2PK: "BETTER_AUTH#better_auth_sessions#userId#user-1",
    GSI2SK: "session-1",
  });
});

test("binds each backfill update to the observed identity and old derived keys", () => {
  const item = session("session-1", "user-1", { GSI2PK: "old-pk", GSI2SK: "old-sk" });
  const [plan] = planBackfill([item]).ready;
  const update = buildBackfillUpdate("PGPZCommunityNextAuth", plan);
  assert.deepEqual(update.Key, { pk: item.pk, sk: item.sk });
  assert.match(update.ConditionExpression, /#type = :type AND #id = :id AND #userId = :userId/);
  assert.equal(update.ExpressionAttributeValues[":oldGsi2pk"], "old-pk");
  assert.equal(update.ExpressionAttributeValues[":oldGsi2sk"], "old-sk");
});

test("backfill dry-run never writes and apply fails closed on any invalid record", async () => {
  const writes = [];
  const base = {
    callerAccount: async () => "860091316962",
    describeTable: async () => table(),
    listOwnedRecords: async () => [session("session-1", "user-1"), session("bad", "")],
    applyUpdate: async (input) => writes.push(input),
  };
  const dry = await runBackfill({
    options: options({ phase: "backfill" }),
    dependencies: base,
  });
  assert.equal(dry.planned, 1);
  assert.equal(dry.invalid, 1);
  assert.equal(writes.length, 0);

  const apply = await runBackfill({
    options: options({ phase: "backfill", apply: true }),
    dependencies: base,
  });
  assert.equal(apply.updated, 0);
  assert.equal(writes.length, 0);
});

test("backfill apply writes all valid derived keys and reports conditional races", async () => {
  const writes = [];
  const events = [];
  const summary = await runBackfill({
    options: options({ phase: "backfill", apply: true }),
    dependencies: {
      callerAccount: async () => "860091316962",
      describeTable: async () => table(),
      listOwnedRecords: async () => [session("session-1", "user-1"), account("account-1", "user-1")],
      applyUpdate: async (input) => {
        writes.push(input);
        if (writes.length === 2) {
          const error = new Error("changed");
          error.name = "ConditionalCheckFailedException";
          throw error;
        }
      },
    },
    log: (event) => events.push(event),
  });
  assert.equal(summary.updated, 1);
  assert.equal(summary.failed, 1);
  assert.equal(writes.length, 2);
  assert.equal(events[0].reason, "record-changed-during-backfill");
  assert.match(events[0].recordHash, /^[a-f0-9]{16}$/);
});
