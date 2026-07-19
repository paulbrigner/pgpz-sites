import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAmplifyComputeRolePlan,
  buildAmplifyComputeTrustPolicy,
} from "./amplify-compute-role.mjs";

const common = {
  accountId: "123456789012",
  region: "us-east-1",
  bucket: "pgpz-content",
  prefix: "policy-updates/uploads",
  sesIdentityArn: "arn:aws:ses:us-east-1:123456789012:identity/pgpz.org",
};

test("uses the documented Amplify compute service principal", () => {
  assert.deepEqual(buildAmplifyComputeTrustPolicy().Statement[0].Principal, {
    Service: "amplify.amazonaws.com",
  });
});

test("scopes Community permissions to its table, content prefix, and sender", () => {
  const plan = buildAmplifyComputeRolePlan({
    applicationName: "community",
    ...common,
    fromAddress: "no-reply@community.pgpz.org",
  });
  assert.equal(plan.appId, "d2xb9ethk5a24j");
  assert.equal(plan.branchName, "main");
  assert.equal(plan.permissionPolicy.Statement.length, 4);
  assert.match(
    JSON.stringify(plan.permissionPolicy),
    /table\/PGPZCommunityNextAuth/,
  );
  assert.doesNotMatch(
    JSON.stringify(plan.permissionPolicy),
    /table\/PGPZCoalitionNextAuth/,
  );
  assert.deepEqual(plan.permissionPolicy.Statement.at(-1).Action, [
    "ses:SendEmail",
    "ses:SendRawEmail",
  ]);
  assert.doesNotMatch(JSON.stringify(plan.permissionPolicy), /dynamodb:DescribeTable/);
});

test("grants Coalition only the actions used by one-way Community sync", () => {
  const plan = buildAmplifyComputeRolePlan({
    applicationName: "coalition",
    ...common,
    fromAddress: "no-reply@coalition.pgpz.org",
  });
  const sync = plan.permissionPolicy.Statement.find(
    (statement) => statement.Sid === "CommunityEntitlementSynchronization",
  );
  assert.ok(sync);
  assert.match(JSON.stringify(sync.Resource), /table\/PGPZCommunityNextAuth/);
  assert.deepEqual(sync.Action, [
    "dynamodb:Query",
    "dynamodb:TransactWriteItems",
    "dynamodb:UpdateItem",
  ]);
});

test("rejects a display-name From value in the IAM condition", () => {
  assert.throws(
    () =>
      buildAmplifyComputeRolePlan({
        applicationName: "community",
        ...common,
        fromAddress: "PGPZ Community <admin@pgpz.org>",
      }),
    /plain email address/,
  );
});
