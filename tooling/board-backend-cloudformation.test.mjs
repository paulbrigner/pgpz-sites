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
  // No cross-app resources and no other AWS services. The role's s3 access
  // (added in Phase 3) must be locked to Board staging/retained buckets only.
  assert.doesNotMatch(policy, /ses:|PGPZCommunity|PGPZCoalition/);
  const s3AllowResources = JSON.stringify(
    role.Policies.flatMap((policyDoc) => policyDoc.PolicyDocument.Statement)
      .filter((statement) => statement.Effect === "Allow" && statement.Action.some((action) => typeof action === "string" && action.startsWith("s3:")))
      .map((statement) => statement.Resource),
  );
  assert.match(s3AllowResources, /BoardStagingBucket/);
  assert.match(s3AllowResources, /BoardRetainedBucket/);
  assert.doesNotMatch(s3AllowResources, /BoardAuditArchiveBucket/);
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

test("provisions dedicated governance and audit tables with retention protection", () => {
  const resources = buildBoardBackendTemplate().Resources;
  const docs = resources.BoardDocumentsTable;
  assert.equal(docs.Properties.TableName, "PGPZBoardDocuments");
  assert.equal(docs.DeletionPolicy, "Retain");
  assert.equal(docs.UpdateReplacePolicy, "Retain");
  assert.equal(docs.Properties.DeletionProtectionEnabled, true);
  assert.deepEqual(docs.Properties.PointInTimeRecoverySpecification, { PointInTimeRecoveryEnabled: true });
  assert.equal(docs.Properties.SSESpecification.SSEEnabled, true);
  assert.equal(docs.Properties.SSESpecification.SSEType, "KMS");
  assert.deepEqual(docs.Properties.SSESpecification.KMSMasterKeyId, { Ref: "BoardKmsKey" });
  // Documents and audit are retained forever: no TTL.
  assert.equal(docs.Properties.TimeToLiveSpecification, undefined);

  const audit = resources.BoardAuditLogTable;
  assert.equal(audit.Properties.TableName, "PGPZBoardAuditLog");
  assert.equal(audit.Properties.DeletionProtectionEnabled, true);
  assert.deepEqual(audit.Properties.StreamSpecification, { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" });
  assert.equal(audit.Properties.TimeToLiveSpecification, undefined);
});

test("uses a Board-only KMS key with rotation for docs, audit, and all buckets", () => {
  const resources = buildBoardBackendTemplate().Resources;
  const key = resources.BoardKmsKey;
  assert.equal(key.Properties.EnableKeyRotation, true);
  assert.equal(key.Properties.Enabled, true);
  assert.equal(key.Properties.KeySpec, "SYMMETRIC_DEFAULT");

  const refs = [
    resources.BoardDocumentsTable.Properties.SSESpecification.KMSMasterKeyId,
    resources.BoardAuditLogTable.Properties.SSESpecification.KMSMasterKeyId,
    resources.BoardRetainedBucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.KMSMasterKeyID,
    resources.BoardStagingBucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.KMSMasterKeyID,
    resources.BoardAuditArchiveBucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.KMSMasterKeyID,
  ];
  for (const ref of refs) assert.deepEqual(ref, { Ref: "BoardKmsKey" });
});

test("splits storage into staging, retained, and WORM archive boundaries", () => {
  const resources = buildBoardBackendTemplate().Resources;
  const retained = resources.BoardRetainedBucket.Properties;
  assert.equal(retained.VersioningConfiguration.Status, "Enabled");
  assert.equal(retained.ObjectLockEnabledForBucket, true);
  assert.deepEqual(retained.ObjectLockConfiguration.Rule.DefaultRetention, {
    Mode: { Ref: "BoardObjectLockMode" },
    Days: { Ref: "BoardRetentionDays" },
  });
  assert.deepEqual(retained.PublicAccessBlockConfiguration, {
    BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true,
  });
  retained.BucketPolicy.Statement.forEach((statement) => {
    assert.deepEqual(statement.Effect, "Deny");
    assert.deepEqual(statement.Condition, { Bool: { "aws:SecureTransport": "false" } });
  });
  assert.equal(retained.OwnershipControls.Rules[0].ObjectOwnership, "BucketOwnerEnforced");

  const staging = resources.BoardStagingBucket.Properties;
  assert.equal(staging.VersioningConfiguration.Status, "Disabled");
  assert.equal(staging.LifecycleConfiguration.Rules[0].Prefix, "staging/");
  assert.deepEqual(staging.LifecycleConfiguration.Rules[0].ExpirationInDays, { Ref: "BoardStagingExpirationDays" });

  const archive = resources.BoardAuditArchiveBucket.Properties;
  assert.equal(archive.ObjectLockEnabledForBucket, true);
  assert.equal(archive.VersioningConfiguration.Status, "Enabled");
});

test("isolates the audit archive behind a separately permissioned archiver", () => {
  const resources = buildBoardBackendTemplate().Resources;
  const archiver = resources.BoardAuditArchiverRole.Properties;
  assert.equal(archiver.RoleName, "PgpzBoardAuditArchiver");
  // The archiver is a distinct resource/role — never the web compute role.
  assert.notEqual(resources.BoardAuditArchiverRole, resources.BoardAmplifyComputeRole);
  const streamStatement = archiver.Policies[0].PolicyDocument.Statement[0];
  assert.deepEqual(streamStatement.Resource, { "Fn::GetAtt": ["BoardAuditLogTable", "StreamArn"] });
  const archiveStatement = archiver.Policies[1].PolicyDocument.Statement[0];
  assert.deepEqual(archiveStatement.Action, ["s3:PutObject", "s3:GetObject", "s3:PutObjectLegalHold"]);
  assert.match(JSON.stringify(archiveStatement.Resource), /BoardAuditArchiveBucket/);
});

test("keeps the web compute role append-only on audit and delete-proof on retained documents", () => {
  const template = buildBoardBackendTemplate();
  const role = template.Resources.BoardAmplifyComputeRole.Properties;
  const statements = role.Policies[1].PolicyDocument.Statement;

  const audit = statements.find((statement) => statement.Sid === "AuditAppendOnly");
  assert.deepEqual(audit.Action, ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"]);

  const documents = statements.find((statement) => statement.Sid === "DocumentsReadWriteNoDelete");
  assert.ok(!documents.Action.includes("dynamodb:DeleteItem"));
  assert.ok(!documents.Action.includes("dynamodb:Scan"));

  const staging = statements.find((statement) => statement.Sid === "StagingPutGetDelete");
  assert.ok(staging.Action.includes("s3:DeleteObject"));

  const retained = statements.find((statement) => statement.Sid === "RetainedPutGetNoDelete");
  assert.ok(!retained.Action.includes("s3:DeleteObject"));
  assert.ok(retained.Action.includes("s3:PutObject"));
  assert.deepEqual(retained.Resource, { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardRetainedBucket}/objects/*" });

  const deny = statements.find((statement) => statement.Sid === "NeverDeleteRetainedObjectLock");
  assert.deepEqual(deny.Effect, "Deny");
  assert.deepEqual(deny.Action, ["s3:DeleteObject", "s3:DeleteObjectVersion"]);

  const allowPolicy = JSON.stringify(role.Policies);
  // The web runtime may NEVER write to the WORM archive (only the Deny references it).
  const allowStatementJson = JSON.stringify(statements.filter((statement) => statement.Effect === "Allow"));
  assert.doesNotMatch(allowStatementJson, /BoardAuditArchiveBucket/);
  assert.doesNotMatch(allowPolicy, /ses:|PGPZCommunity|PGPZCoalition/);
});

test("exposes governance resource names and arns from the stack plan", () => {
  const plan = buildBoardBackendStackPlan({ accountId: "123456789012" });
  assert.equal(plan.documentsTableArn, "arn:aws:dynamodb:us-east-1:123456789012:table/PGPZBoardDocuments");
  assert.equal(plan.auditTableArn, "arn:aws:dynamodb:us-east-1:123456789012:table/PGPZBoardAuditLog");
  assert.equal(plan.auditArchiverRoleArn, "arn:aws:iam::123456789012:role/PgpzBoardAuditArchiver");
  assert.match(JSON.stringify(plan.template.Outputs), /DocumentsTableName|AuditTableName|RetainedBucket|AuditArchiveBucket|AuditArchiverRoleArn/);
});
