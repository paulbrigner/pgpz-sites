import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClaimTransaction,
  parseArgs,
  planEmailOwnershipClaims,
  runBackfill,
} from "./backfill-email-ownership-claims.mjs";

const appUser = (id, email) => ({
  pk: `USER#${id}`,
  sk: `USER#${id}`,
  type: "USER",
  id,
  email,
  GSI1PK: `USER#${email}`,
  GSI1SK: `USER#${email}`,
});

const betterAuthUser = (id, email) => ({
  pk: `BETTER_AUTH#better_auth_users#${id}`,
  sk: `BETTER_AUTH#better_auth_users#${id}`,
  type: "BETTER_AUTH#better_auth_users",
  id,
  email,
  GSI1PK: `BETTER_AUTH#better_auth_users#email#${email}`,
  GSI1SK: id,
});

test("defaults to a per-app read-only dry-run", () => {
  const options = parseArgs(["--app", "community"]);
  assert.equal(options.apply, false);
  assert.equal(options.tableName, "PGPZCommunityNextAuth");
  assert.throws(() => parseArgs([]), /Select a target/);
  assert.throws(() => parseArgs(["--app", "both"]), /community or coalition/);
});

test("plans one claim for legitimate identities whose ids differ", () => {
  const { plans, invalid } = planEmailOwnershipClaims([
    appUser("app-user-1", "member@example.test"),
    betterAuthUser("better-user-1", "member@example.test"),
  ]);
  assert.equal(invalid, 0);
  assert.equal(plans.length, 1);
  assert.deepEqual(
    {
      status: plans[0].status,
      appUserId: plans[0].appUserId,
      betterAuthUserId: plans[0].betterAuthUserId,
    },
    {
      status: "ready",
      appUserId: "app-user-1",
      betterAuthUserId: "better-user-1",
    },
  );
});

test("treats app-only users as valid and duplicate same-type emails as collisions", () => {
  const appOnly = planEmailOwnershipClaims([appUser("app-user-1", "member@example.test")]);
  assert.equal(appOnly.plans[0].status, "ready");
  assert.equal(appOnly.plans[0].betterAuthUserId, null);

  const duplicate = planEmailOwnershipClaims([
    appUser("app-user-1", "member@example.test"),
    appUser("app-user-2", "MEMBER@example.test"),
  ]);
  assert.equal(duplicate.plans[0].status, "collision");
  assert.equal(duplicate.plans[0].reason, "duplicate-app-email");
});

test("fails closed when an ownership key is occupied by a malformed record", () => {
  const result = planEmailOwnershipClaims([
    appUser("app-user-1", "member@example.test"),
    {
      pk: "EMAIL_OWNERSHIP#member@example.test",
      sk: "EMAIL_OWNERSHIP#member@example.test",
      type: "UNEXPECTED",
      email: "member@example.test",
    },
  ]);

  assert.equal(result.invalid, 1);
  assert.equal(result.plans[0].status, "ready");
});

test("builds a claim transaction bound to both source identity records", () => {
  const { plans } = planEmailOwnershipClaims([
    appUser("app-user-1", "member@example.test"),
    betterAuthUser("better-user-1", "member@example.test"),
  ]);
  const transaction = buildClaimTransaction({
    tableName: "TestTable",
    plan: plans[0],
    now: "2026-07-19T12:00:00.000Z",
  });

  assert.equal(transaction.TransactItems.length, 3);
  assert.deepEqual(transaction.TransactItems[0].Update.Key, {
    pk: "EMAIL_OWNERSHIP#member@example.test",
    sk: "EMAIL_OWNERSHIP#member@example.test",
  });
  assert.equal(
    transaction.TransactItems[0].Update.ExpressionAttributeValues[":appUserId"],
    "app-user-1",
  );
  assert.equal(
    transaction.TransactItems[0].Update.ExpressionAttributeValues[":betterAuthUserId"],
    "better-user-1",
  );
  assert.equal(transaction.TransactItems.filter((item) => item.ConditionCheck).length, 2);
});

test("dry-run reports plans and collisions without attempting writes or exposing emails", async () => {
  const calls = [];
  const events = [];
  const summary = await runBackfill({
    options: { apply: false, tableName: "TestTable" },
    dependencies: {
      listItems: async () => [
        appUser("one", "duplicate@example.test"),
        appUser("two", "duplicate@example.test"),
        appUser("three", "valid@example.test"),
      ],
      applyClaim: async (value) => calls.push(value),
      now: () => "2026-07-19T12:00:00.000Z",
    },
    log: (event) => events.push(event),
  });

  assert.equal(summary.planned, 1);
  assert.equal(summary.collisions, 1);
  assert.equal(calls.length, 0);
  assert.equal(events[0].email, undefined);
  assert.match(events[0].emailHash, /^[a-f0-9]{16}$/);
});

test("apply refuses every write when the preflight contains a collision", async () => {
  const calls = [];
  const summary = await runBackfill({
    options: { apply: true, tableName: "TestTable" },
    dependencies: {
      listItems: async () => [
        appUser("one", "duplicate@example.test"),
        appUser("two", "duplicate@example.test"),
        appUser("three", "valid@example.test"),
      ],
      applyClaim: async (value) => calls.push(value),
      now: () => "2026-07-19T12:00:00.000Z",
    },
  });

  assert.equal(summary.collisions, 1);
  assert.equal(summary.planned, 1);
  assert.equal(summary.claimed, 0);
  assert.equal(calls.length, 0);
});

test("apply writes once and an immediate second apply is idempotent", async () => {
  const email = "member@example.test";
  const items = [
    appUser("app-user-1", email),
    betterAuthUser("better-user-1", email),
  ];
  const calls = [];
  const dependencies = {
    listItems: async () => items,
    applyClaim: async (transaction) => {
      calls.push(transaction);
      const update = transaction.TransactItems[0].Update;
      items.push({
        ...update.Key,
        type: update.ExpressionAttributeValues[":type"],
        email: update.ExpressionAttributeValues[":email"],
        appUserId: update.ExpressionAttributeValues[":appUserId"],
        betterAuthUserId: update.ExpressionAttributeValues[":betterAuthUserId"],
      });
    },
    now: () => "2026-07-19T12:00:00.000Z",
  };
  const first = await runBackfill({
    options: { apply: true, tableName: "TestTable" },
    dependencies,
  });
  const second = await runBackfill({
    options: { apply: true, tableName: "TestTable" },
    dependencies,
  });
  assert.equal(first.claimed, 1);
  assert.equal(second.alreadyClaimed, 1);
  assert.equal(second.claimed, 0);
  assert.equal(calls.length, 1);
});
