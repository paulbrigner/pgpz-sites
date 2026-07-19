import assert from "node:assert/strict";
import test from "node:test";
import {
  BETTER_AUTH_SESSION_TYPE,
  SESSION_DELETE_BATCH_SIZE,
  assertSessionRevocationConfirmation,
  buildConditionalSessionDeleteBatches,
  buildSessionScanArguments,
  collectSessionKeys,
} from "./better-auth-session-revocation.mjs";

test("scans consistently for only the exact Better Auth session type", () => {
  const arguments_ = buildSessionScanArguments({ tableName: "PGPZCommunityNextAuth" });
  assert.ok(arguments_.includes("--consistent-read"));
  assert.equal(arguments_[arguments_.indexOf("--filter-expression") + 1], "#recordType = :sessionType");
  assert.deepEqual(
    JSON.parse(arguments_[arguments_.indexOf("--expression-attribute-values") + 1]),
    { ":sessionType": { S: BETTER_AUTH_SESSION_TYPE } },
  );
  assert.equal(arguments_[arguments_.indexOf("--projection-expression") + 1], "pk, sk");
});

test("collects and de-duplicates only valid DynamoDB keys", () => {
  const key = { pk: { S: "session-1" }, sk: { S: "session-1" } };
  assert.deepEqual(collectSessionKeys([{ Items: [key] }, { Items: [key] }]), [key]);
  assert.throws(
    () => collectSessionKeys([{ Items: [{ pk: { S: "session-1" } }] }]),
    /pk\/sk/,
  );
});

test("builds bounded transactional deletes guarded by the exact record type", () => {
  const keys = Array.from({ length: SESSION_DELETE_BATCH_SIZE + 1 }, (_, index) => ({
    pk: { S: `session-${index}` },
    sk: { S: `session-${index}` },
  }));
  const batches = buildConditionalSessionDeleteBatches({
    tableName: "PGPZCommunityNextAuth",
    keys,
  });
  assert.deepEqual(batches.map((batch) => batch.length), [SESSION_DELETE_BATCH_SIZE, 1]);
  assert.deepEqual(batches[0][0].Delete, {
    TableName: "PGPZCommunityNextAuth",
    Key: keys[0],
    ConditionExpression: "#recordType = :sessionType",
    ExpressionAttributeNames: { "#recordType": "type" },
    ExpressionAttributeValues: {
      ":sessionType": { S: BETTER_AUTH_SESSION_TYPE },
    },
  });
});

test("requires both an explicit phrase and an exact table confirmation before apply", () => {
  const input = {
    apply: true,
    confirmation: "REVOKE-BETTER-AUTH-SESSIONS",
    confirmedTable: "PGPZCommunityNextAuth",
    tableName: "PGPZCommunityNextAuth",
  };
  assert.doesNotThrow(() => assertSessionRevocationConfirmation(input));
  assert.throws(
    () => assertSessionRevocationConfirmation({ ...input, confirmation: "yes" }),
    /REVOKE-BETTER-AUTH-SESSIONS/,
  );
  assert.throws(
    () => assertSessionRevocationConfirmation({ ...input, confirmedTable: "other" }),
    /exactly match/,
  );
});
