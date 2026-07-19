import assert from "node:assert/strict";
import test from "node:test";

import {
  auditExitCode,
  auditIdentityItems,
  parseArgs,
  runAudit,
} from "./audit-identity-integrity.mjs";

const appUser = (id, email, overrides = {}) => ({
  pk: `USER#${id}`,
  sk: `USER#${id}`,
  type: "USER",
  id,
  email,
  GSI1PK: `USER#${email}`,
  GSI1SK: `USER#${email}`,
  ...overrides,
});

const betterAuthUser = (id, email, overrides = {}) => ({
  pk: `BETTER_AUTH#better_auth_users#${id}`,
  sk: `BETTER_AUTH#better_auth_users#${id}`,
  type: "BETTER_AUTH#better_auth_users",
  id,
  email,
  GSI1PK: `BETTER_AUTH#better_auth_users#email#${email}`,
  GSI1SK: id,
  ...overrides,
});

const claim = (email, appUserId, betterAuthUserId) => ({
  pk: `EMAIL_OWNERSHIP#${email}`,
  sk: `EMAIL_OWNERSHIP#${email}`,
  type: "EMAIL_OWNERSHIP",
  email,
  ...(appUserId ? { appUserId } : {}),
  ...(betterAuthUserId ? { betterAuthUserId } : {}),
});

test("repair mode requires a deliberate confirmation phrase", () => {
  assert.equal(parseArgs(["--app", "community"]).repair, false);
  assert.throws(
    () => parseArgs(["--app", "community", "--repair"]),
    /--confirm REPAIR-UNAMBIGUOUS/,
  );
  assert.equal(
    parseArgs([
      "--app",
      "community",
      "--repair",
      "--confirm",
      "REPAIR-UNAMBIGUOUS",
    ]).repair,
    true,
  );
});

test("accepts app-only users and matched identities whose ids differ", () => {
  const audit = auditIdentityItems([
    appUser("app-only", "app-only@example.test"),
    claim("app-only@example.test", "app-only", null),
    appUser("app-user", "matched@example.test"),
    betterAuthUser("better-user", "matched@example.test"),
    claim("matched@example.test", "app-user", "better-user"),
  ]);
  assert.equal(audit.summary.issues, 0);
});

test("flags Better-Auth-only users for manual review but never automatic deletion", () => {
  const audit = auditIdentityItems([
    betterAuthUser("better-only", "better-only@example.test"),
    claim("better-only@example.test", null, "better-only"),
  ]);
  const issue = audit.issues.find(
    (candidate) => candidate.code === "better-auth-user-without-app-user",
  );
  assert.ok(issue);
  assert.equal(issue.severity, "warning");
  assert.equal(issue.repair, null);
  assert.equal(audit.summary.errors, 0);
  assert.equal(audit.summary.blocking, 0);
  assert.equal(auditExitCode({ ...audit.summary, repairFailed: 0 }), 0);
});

test("reports ambiguous duplicate ownership and dependent orphans without repair actions", () => {
  const audit = auditIdentityItems([
    appUser("one", "duplicate@example.test"),
    appUser("two", "duplicate@example.test"),
    {
      pk: "BETTER_AUTH#better_auth_sessions#session-1",
      sk: "BETTER_AUTH#better_auth_sessions#session-1",
      type: "BETTER_AUTH#better_auth_sessions",
      id: "session-1",
      userId: "missing-better-user",
      token: "token-1",
      GSI1PK: "BETTER_AUTH#better_auth_sessions#token#token-1",
      GSI1SK: "session-1",
    },
  ]);

  const duplicate = audit.issues.find((issue) => issue.code === "ambiguous-duplicate-app-email");
  const orphan = audit.issues.find((issue) => issue.code === "orphan-better-auth-dependent");
  assert.equal(duplicate.repair, null);
  assert.equal(orphan.repair, null);
  assert.equal(audit.summary.critical, 1);
});

test("an orphan Better Auth dependent produces a blocking CLI result", () => {
  const audit = auditIdentityItems([
    {
      pk: "BETTER_AUTH#better_auth_sessions#session-1",
      sk: "BETTER_AUTH#better_auth_sessions#session-1",
      type: "BETTER_AUTH#better_auth_sessions",
      id: "session-1",
      userId: "missing-better-user",
      token: "token-1",
      GSI1PK: "BETTER_AUTH#better_auth_sessions#token#token-1",
      GSI1SK: "session-1",
    },
  ]);

  assert.equal(audit.summary.critical, 0);
  assert.equal(audit.summary.errors, 1);
  assert.equal(audit.summary.blocking, 1);
  assert.equal(auditExitCode({ ...audit.summary, repairFailed: 0 }), 2);
});

test("reports accounts and sessions that have no Better Auth user reference", () => {
  const audit = auditIdentityItems([
    {
      pk: "BETTER_AUTH#better_auth_sessions#session-1",
      sk: "BETTER_AUTH#better_auth_sessions#session-1",
      type: "BETTER_AUTH#better_auth_sessions",
      id: "session-1",
      token: "token-1",
      GSI1PK: "BETTER_AUTH#better_auth_sessions#token#token-1",
      GSI1SK: "session-1",
    },
  ]);

  const issue = audit.issues.find((candidate) => candidate.code === "malformed-user-reference");
  assert.ok(issue);
  assert.equal(issue.repair, null);
});

test("offers only claim and index metadata repairs when ownership is unambiguous", () => {
  const audit = auditIdentityItems([
    appUser("app-user", "member@example.test", {
      GSI1PK: "USER#wrong@example.test",
      GSI1SK: "USER#wrong@example.test",
    }),
    betterAuthUser("better-user", "member@example.test"),
  ], "TestTable");
  const repairKinds = audit.issues.filter((issue) => issue.repair).map((issue) => issue.repair.kind).sort();
  assert.deepEqual(repairKinds, ["claim", "index"]);
  for (const issue of audit.issues) {
    const serialized = JSON.stringify(issue.repair || {});
    assert.equal(serialized.includes('"Delete"'), false);
    assert.equal(serialized.includes('"delete"'), false);
  }
});

test("read-only audit never invokes repair dependencies", async () => {
  const calls = [];
  const summary = await runAudit({
    options: { repair: false, tableName: "TestTable" },
    dependencies: {
      listItems: async () => [appUser("app-user", "member@example.test")],
      applyRepair: async (repair) => calls.push(repair),
      now: () => "2026-07-19T12:00:00.000Z",
    },
  });
  assert.equal(summary.mode, "audit");
  assert.equal(summary.repairable, 1);
  assert.equal(calls.length, 0);
});

test("repair mode decides success from a fresh post-repair audit", async () => {
  let items = [appUser("app-user", "member@example.test")];
  const summary = await runAudit({
    options: { repair: true, tableName: "TestTable" },
    dependencies: {
      listItems: async () => items,
      applyRepair: async () => {
        items = [
          items[0],
          claim("member@example.test", "app-user", null),
        ];
      },
      now: () => "2026-07-19T12:00:00.000Z",
    },
  });

  assert.equal(summary.initialIssues, 1);
  assert.equal(summary.issues, 0);
  assert.equal(summary.blocking, 0);
  assert.equal(summary.repaired, 1);
  assert.equal(auditExitCode(summary), 0);
});

test("guarded repair applies only unambiguous operations and leaves orphans untouched", async () => {
  const calls = [];
  const items = [
    appUser("app-user", "member@example.test"),
    {
      pk: "BETTER_AUTH#better_auth_accounts#account-1",
      sk: "BETTER_AUTH#better_auth_accounts#account-1",
      type: "BETTER_AUTH#better_auth_accounts",
      id: "account-1",
      userId: "missing-user",
      providerId: "email",
      accountId: "member@example.test",
      GSI1PK: "BETTER_AUTH#better_auth_accounts#provider#email#member@example.test",
      GSI1SK: "account-1",
    },
  ];
  const summary = await runAudit({
    options: { repair: true, tableName: "TestTable" },
    dependencies: {
      listItems: async () => items,
      applyRepair: async (repair) => calls.push(repair),
      now: () => "2026-07-19T12:00:00.000Z",
    },
  });
  assert.equal(summary.repaired, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, "claim");
  assert.equal(JSON.stringify(calls).includes('"Delete"'), false);
  assert.ok(summary.blocking > 0);
  assert.equal(auditExitCode(summary), 2);
});
