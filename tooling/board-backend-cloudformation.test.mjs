import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_BACKEND,
  BOARD_DYNAMODB_ACTIONS,
  buildBoardBackendStackPlan,
  buildBoardBackendTemplate,
} from "./board-backend-cloudformation.mjs";
import {
  APPLY_CONFIRMATION,
  buildCliPlan,
  parseArguments,
} from "./provision-board-backend.mjs";

test("builds an isolated Board backend plan", () => {
  const plan = buildBoardBackendStackPlan({ accountId: "123456789012" });
  assert.equal(plan.stackName, "PgpzBoardBackend");
  assert.equal(plan.tableName, "PGPZBoardNextAuth");
  assert.equal(plan.computeRoleArn, "arn:aws:iam::123456789012:role/PgpzBoardAmplifyMainCompute");
  assert.doesNotMatch(JSON.stringify(plan.template), /Community|Coalition/);
  assert.throws(
    () => buildBoardBackendStackPlan({ accountId: "wrong" }),
    /12 digits/,
  );
});

test("protects and encrypts the Board authentication table", () => {
  const table = buildBoardBackendTemplate().Resources.BoardAuthTable;
  assert.equal(table.DeletionPolicy, "Retain");
  assert.equal(table.UpdateReplacePolicy, "Retain");
  assert.equal(table.Properties.TableName, BOARD_BACKEND.tableName);
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
    table.Properties.GlobalSecondaryIndexes.map((index) => index.IndexName),
    ["GSI1", "GSI2"],
  );
});

test("limits the Amplify role to the Board table and its indexes", () => {
  const template = buildBoardBackendTemplate();
  const role = template.Resources.BoardAmplifyComputeRole.Properties;
  const statement = role.Policies[0].PolicyDocument.Statement[0];
  assert.equal(role.RoleName, BOARD_BACKEND.computeRoleName);
  assert.deepEqual(
    role.AssumeRolePolicyDocument.Statement[0].Principal,
    { Service: "amplify.amazonaws.com" },
  );
  assert.deepEqual(statement.Action, [...BOARD_DYNAMODB_ACTIONS]);
  assert.deepEqual(statement.Resource, [
    { "Fn::GetAtt": ["BoardAuthTable", "Arn"] },
    { "Fn::Sub": "${BoardAuthTable.Arn}/index/*" },
  ]);
  const policy = JSON.stringify(role.Policies);
  assert.doesNotMatch(policy, /ses:|s3:|PGPZCommunity|PGPZCoalition/);
});

test("deployment is a dry run by default and apply is explicitly gated", () => {
  const parsed = parseArguments(["--account-id", "123456789012"]);
  const dryRun = buildCliPlan(parsed);
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.terminationProtection, true);

  assert.throws(
    () => buildCliPlan({
      values: { "account-id": "123456789012", confirm: "wrong" },
      flags: new Set(["apply"]),
    }),
    new RegExp(APPLY_CONFIRMATION),
  );
  assert.throws(
    () => parseArguments(["--apply", "--validate-only"]),
    /mutually exclusive/,
  );
});
