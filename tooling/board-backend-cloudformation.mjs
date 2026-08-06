export const BOARD_BACKEND = Object.freeze({
  applicationName: "board",
  stackName: "PgpzBoardBackend",
  tableName: "PGPZBoardNextAuth",
  documentsTableName: "PGPZBoardDocuments",
  auditTableName: "PGPZBoardAuditLog",
  computeRoleName: "PgpzBoardAmplifyMainCompute",
  auditArchiverRoleName: "PgpzBoardAuditArchiver",
});

export const BOARD_DYNAMODB_ACTIONS = Object.freeze([
  "dynamodb:DeleteItem",
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:Query",
  "dynamodb:Scan",
  "dynamodb:TransactWriteItems",
  "dynamodb:UpdateItem",
]);

/** Documents table: full read plus transactional/conditional mutations, but
 * NO DeleteItem and NO Scan (list through the built-in library GSI). */
export const BOARD_DOCUMENTS_ACTIONS = Object.freeze([
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:Query",
  "dynamodb:UpdateItem",
  "dynamodb:TransactWriteItems",
]);

/** Audit table: append-only. Only the immutable Put and read/query actions —
 * deliberately NO UpdateItem / DeleteItem / Scan. */
export const BOARD_AUDIT_ACTIONS = Object.freeze([
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:Query",
]);

/** Web compute S3 on retained objects: never delete. */
export const BOARD_RETAINED_S3_ACTIONS = Object.freeze([
  "s3:PutObject",
  "s3:GetObject",
  "s3:HeadObject",
]);

function amplifyTrustPolicy() {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowAmplifySsrCompute",
        Effect: "Allow",
        Principal: { Service: "amplify.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  };
}

const resourceTags = Object.freeze([
  { Key: "Project", Value: "pgpz" },
  { Key: "Application", Value: BOARD_BACKEND.applicationName },
  { Key: "Environment", Value: "production" },
]);

const confidentialTags = Object.freeze([
  ...resourceTags,
  { Key: "DataClassification", Value: "confidential" },
]);

/** TLS-only guard policy applied to every Board bucket. */
function tlsOnlyBucketPolicy(bucket, readWrite = ["s3:*"]) {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "DenyInsecureTransport",
        Effect: "Deny",
        Principal: "*",
        Action: readWrite,
        Resource: [
          { "Fn::Sub": `arn:${"${AWS::Partition}"}:s3:::${bucket}` },
          { "Fn::Sub": `arn:${"${AWS::Partition}"}:s3:::${bucket}/*` },
        ],
        Condition: { Bool: { "aws:SecureTransport": "false" } },
      },
    ],
  };
}

const publicAccessBlock = Object.freeze({
  BlockPublicAcls: true,
  BlockPublicPolicy: true,
  IgnorePublicAcls: true,
  RestrictPublicBuckets: true,
});

const bucketOwnerEnforced = Object.freeze({
  OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
});

function kmsEncryption(keyRef) {
  return {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        {
          ServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms", KMSMasterKeyID: { Ref: keyRef } },
        },
      ],
    },
  };
}

function objectLockDefault(modeParam, daysParam) {
  return {
    ObjectLockEnabled: "Enabled",
    Rule: {
      DefaultRetention: { Mode: { Ref: modeParam }, Days: { Ref: daysParam } },
    },
  };
}

export function buildBoardBackendTemplate() {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Isolated auth, governance-document, and audit backend for the private PGPZ Board portal",
    Parameters: {
      BoardObjectLockMode: {
        Type: "String",
        Default: "GOVERNANCE",
        AllowedValues: ["GOVERNANCE", "COMPLIANCE"],
        Description:
          "S3 Object Lock default-retention mode. Use GOVERNANCE in the isolated test stack; switch to COMPLIANCE in production only after legal counsel approves the irreversible retention period.",
      },
      BoardRetentionDays: {
        Type: "Number",
        Default: 90,
        MinValue: 1,
        Description: "Default Object Lock retention period (days) for retained documents and audit archives. A legal decision, not a source constant.",
      },
      BoardStagingExpirationDays: {
        Type: "Number",
        Default: 1,
        MinValue: 1,
        MaxValue: 7,
        Description: "Days before an unreconciled staging object is lifecycle-expired.",
      },
    },
    Resources: {
      BoardAuthTable: {
        Type: "AWS::DynamoDB::Table",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          TableName: BOARD_BACKEND.tableName,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
            { AttributeName: "GSI1PK", AttributeType: "S" },
            { AttributeName: "GSI1SK", AttributeType: "S" },
            { AttributeName: "GSI2PK", AttributeType: "S" },
            { AttributeName: "GSI2SK", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "GSI1",
              KeySchema: [
                { AttributeName: "GSI1PK", KeyType: "HASH" },
                { AttributeName: "GSI1SK", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
            {
              IndexName: "GSI2",
              KeySchema: [
                { AttributeName: "GSI2PK", KeyType: "HASH" },
                { AttributeName: "GSI2SK", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
          TimeToLiveSpecification: { AttributeName: "expires", Enabled: true },
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
          DeletionProtectionEnabled: true,
          SSESpecification: { SSEEnabled: true },
          Tags: confidentialTags,
        },
      },

      // ---- Governance-document table: immutable per-version rows, NO TTL ----
      BoardDocumentsTable: {
        Type: "AWS::DynamoDB::Table",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          TableName: BOARD_BACKEND.documentsTableName,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
            { AttributeName: "libraryPk", AttributeType: "S" },
            { AttributeName: "updatedAt", AttributeType: "S" },
            { AttributeName: "category", AttributeType: "S" },
            { AttributeName: "status", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "Library",
              KeySchema: [
                { AttributeName: "libraryPk", KeyType: "HASH" },
                { AttributeName: "updatedAt", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "KEYS_ONLY" },
            },
            {
              IndexName: "ByCategory",
              KeySchema: [
                { AttributeName: "category", KeyType: "HASH" },
                { AttributeName: "updatedAt", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "KEYS_ONLY" },
            },
            {
              IndexName: "ByStatus",
              KeySchema: [
                { AttributeName: "status", KeyType: "HASH" },
                { AttributeName: "updatedAt", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "KEYS_ONLY" },
            },
          ],
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
          DeletionProtectionEnabled: true,
          SSESpecification: { SSEEnabled: true, SSEType: "KMS", KMSMasterKeyId: { Ref: "BoardKmsKey" } },
          // Deliberately no TimeToLiveSpecification: documents are retained.
          Tags: confidentialTags,
        },
      },

      // ---- Append-only audit ledger table with an independent stream anchor ----
      BoardAuditLogTable: {
        Type: "AWS::DynamoDB::Table",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          TableName: BOARD_BACKEND.auditTableName,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }, { AttributeName: "sk", AttributeType: "S" }],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
          DeletionProtectionEnabled: true,
          SSESpecification: { SSEEnabled: true, SSEType: "KMS", KMSMasterKeyId: { Ref: "BoardKmsKey" } },
          StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
          Tags: confidentialTags,
        },
      },

      // ---- Board-only KMS key (rotation on, services via key policy) ----
      BoardKmsKey: {
        Type: "AWS::KMS::Key",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          Description: "Board-only encryption key for governance documents and the audit ledger",
          Enabled: true,
          EnableKeyRotation: true,
          KeyPolicy: {
            Version: "2012-10-17",
            Id: "pgpz-board-kms",
            Statement: [
              {
                Sid: "EnableIamPermissions",
                Effect: "Allow",
                Principal: { AWS: { "Fn::Sub": "arn:${AWS::Partition}:iam::${AWS::AccountId}:root" } },
                Action: "kms:*",
                Resource: "*",
              },
              {
                Sid: "AllowS3Use",
                Effect: "Allow",
                Principal: { Service: "s3.amazonaws.com" },
                Action: ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:ReEncryptFrom", "kms:ReEncryptTo", "kms:DescribeKey"],
                Resource: "*",
                Condition: { StringEquals: { "aws:SourceAccount": { Ref: "AWS::AccountId" } } },
              },
              {
                Sid: "AllowDynamoDbUse",
                Effect: "Allow",
                Principal: { Service: "dynamodb.amazonaws.com" },
                Action: ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"],
                Resource: "*",
                Condition: { StringEquals: { "aws:SourceAccount": { Ref: "AWS::AccountId" } } },
              },
              {
                Sid: "AllowAuditArchiver",
                Effect: "Allow",
                Principal: { AWS: { "Fn::GetAtt": ["BoardAuditArchiverRole", "Arn"] } },
                Action: ["kms:GenerateDataKey", "kms:Encrypt", "kms:Decrypt"],
                Resource: "*",
              },
            ],
          },
          KeySpec: "SYMMETRIC_DEFAULT",
          Tags: confidentialTags,
        },
      },

      // ---- Short-lived upload staging (lifecycle-expired, deletable) ----
      BoardStagingBucket: {
        Type: "AWS::S3::Bucket",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          ...kmsEncryption("BoardKmsKey"),
          VersioningConfiguration: { Status: "Disabled" },
          PublicAccessBlockConfiguration: publicAccessBlock,
          ...bucketOwnerEnforced,
          LifecycleConfiguration: {
            Rules: [
              {
                Id: "ExpireStaging",
                Status: "Enabled",
                Prefix: "staging/",
                ExpirationInDays: { Ref: "BoardStagingExpirationDays" },
              },
            ],
          },
          BucketPolicy: tlsOnlyBucketPolicy("BoardStagingBucket"),
          Tags: resourceTags,
        },
      },

      // ---- Retained documents: versioned + Object-Locked, no final delete ----
      BoardRetainedBucket: {
        Type: "AWS::S3::Bucket",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          ...kmsEncryption("BoardKmsKey"),
          VersioningConfiguration: { Status: "Enabled" },
          ObjectLockEnabledForBucket: true,
          ObjectLockConfiguration: objectLockDefault("BoardObjectLockMode", "BoardRetentionDays"),
          PublicAccessBlockConfiguration: publicAccessBlock,
          ...bucketOwnerEnforced,
          BucketPolicy: tlsOnlyBucketPolicy("BoardRetainedBucket"),
          Tags: confidentialTags,
        },
      },

      // ---- Independent WORM audit archive (web compute has NO access) ----
      BoardAuditArchiveBucket: {
        Type: "AWS::S3::Bucket",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          ...kmsEncryption("BoardKmsKey"),
          VersioningConfiguration: { Status: "Enabled" },
          ObjectLockEnabledForBucket: true,
          ObjectLockConfiguration: objectLockDefault("BoardObjectLockMode", "BoardRetentionDays"),
          PublicAccessBlockConfiguration: publicAccessBlock,
          ...bucketOwnerEnforced,
          BucketPolicy: tlsOnlyBucketPolicy("BoardAuditArchiveBucket"),
          Tags: confidentialTags,
        },
      },

      // ---- Separately permissioned audit archiver (not web compute) ----
      BoardAuditArchiverRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: BOARD_BACKEND.auditArchiverRoleName,
          Description: "Reads the audit stream and writes to the WORM audit archive; never used by the Board web runtime",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AllowArchiverAssume",
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "ReadAuditStream",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Sid: "AuditStreamOnly",
                    Effect: "Allow",
                    Action: ["dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:DescribeStream"],
                    Resource: { "Fn::GetAtt": ["BoardAuditLogTable", "StreamArn"] },
                  },
                ],
              },
            },
            {
              PolicyName: "WriteAuditArchive",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Sid: "ArchiveWriteOnly",
                    Effect: "Allow",
                    Action: ["s3:PutObject", "s3:GetObject", "s3:PutObjectLegalHold"],
                    Resource: [
                      { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardAuditArchiveBucket}" },
                      { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardAuditArchiveBucket}/*" },
                    ],
                  },
                ],
              },
            },
            {
              PolicyName: "UseKmsForArchive",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Sid: "ArchiveKms",
                    Effect: "Allow",
                    Action: ["kms:GenerateDataKey", "kms:Encrypt", "kms:Decrypt"],
                    Resource: { "Fn::GetAtt": ["BoardKmsKey", "Arn"] },
                  },
                ],
              },
            },
          ],
          Tags: confidentialTags,
        },
      },

      BoardAmplifyComputeRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: BOARD_BACKEND.computeRoleName,
          Description: "Runtime role for the private PGPZ Board Amplify application",
          AssumeRolePolicyDocument: amplifyTrustPolicy(),
          Policies: [
            {
              PolicyName: "BoardAuthTableRuntime",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Sid: "BoardAuthTableOnly",
                    Effect: "Allow",
                    Action: [...BOARD_DYNAMODB_ACTIONS],
                    Resource: [
                      { "Fn::GetAtt": ["BoardAuthTable", "Arn"] },
                      { "Fn::Sub": "${BoardAuthTable.Arn}/index/*" },
                    ],
                  },
                ],
              },
            },
            {
              PolicyName: "BoardGovernanceRuntime",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Sid: "DocumentsReadWriteNoDelete",
                    Effect: "Allow",
                    Action: [...BOARD_DOCUMENTS_ACTIONS],
                    Resource: [
                      { "Fn::GetAtt": ["BoardDocumentsTable", "Arn"] },
                      { "Fn::Sub": "${BoardDocumentsTable.Arn}/index/*" },
                    ],
                  },
                  {
                    Sid: "AuditAppendOnly",
                    Effect: "Allow",
                    Action: [...BOARD_AUDIT_ACTIONS],
                    Resource: [
                      { "Fn::GetAtt": ["BoardAuditLogTable", "Arn"] },
                      { "Fn::Sub": "${BoardAuditLogTable.Arn}/index/*" },
                    ],
                  },
                  {
                    Sid: "StagingPutGetDelete",
                    Effect: "Allow",
                    Action: ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:DeleteObject"],
                    Resource: { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardStagingBucket}/staging/*" },
                  },
                  {
                    Sid: "RetainedPutGetNoDelete",
                    Effect: "Allow",
                    Action: [...BOARD_RETAINED_S3_ACTIONS],
                    Resource: { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardRetainedBucket}/objects/*" },
                  },
                  {
                    Sid: "UseBoardKms",
                    Effect: "Allow",
                    Action: ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:ReEncryptFrom", "kms:ReEncryptTo", "kms:DescribeKey"],
                    Resource: { "Fn::GetAtt": ["BoardKmsKey", "Arn"] },
                  },
                  {
                    Sid: "NeverDeleteRetainedObjectLock",
                    Effect: "Deny",
                    Action: ["s3:DeleteObject", "s3:DeleteObjectVersion"],
                    Resource: [
                      { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardRetainedBucket}/*" },
                      { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardAuditArchiveBucket}/*" },
                    ],
                  },
                ],
              },
            },
          ],
          Tags: [...resourceTags],
        },
      },

      // ---- Operational alarms ----
      BoardDocumentsTableErrorAlarm: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmName: "PgpzBoardDocumentsTableSystemErrors",
          ComparisonOperator: "GreaterThanThreshold",
          EvaluationPeriods: 1,
          Threshold: 0,
          MetricName: "SystemErrors",
          Namespace: "AWS/DynamoDB",
          Statistic: "Sum",
          Period: 300,
          Dimensions: [{ Name: "TableName", Value: BOARD_BACKEND.documentsTableName }],
        },
      },
      BoardAuditTableErrorAlarm: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmName: "PgpzBoardAuditTableSystemErrors",
          ComparisonOperator: "GreaterThanThreshold",
          EvaluationPeriods: 1,
          Threshold: 0,
          MetricName: "SystemErrors",
          Namespace: "AWS/DynamoDB",
          Statistic: "Sum",
          Period: 300,
          Dimensions: [{ Name: "TableName", Value: BOARD_BACKEND.auditTableName }],
        },
      },
    },
    Outputs: {
      TableName: { Value: { Ref: "BoardAuthTable" } },
      TableArn: { Value: { "Fn::GetAtt": ["BoardAuthTable", "Arn"] } },
      DocumentsTableName: { Value: { Ref: "BoardDocumentsTable" } },
      DocumentsTableArn: { Value: { "Fn::GetAtt": ["BoardDocumentsTable", "Arn"] } },
      AuditTableName: { Value: { Ref: "BoardAuditLogTable" } },
      AuditTableArn: { Value: { "Fn::GetAtt": ["BoardAuditLogTable", "Arn"] } },
      AuditTableStreamArn: { Value: { "Fn::GetAtt": ["BoardAuditLogTable", "StreamArn"] } },
      StagingBucket: { Value: { Ref: "BoardStagingBucket" } },
      RetainedBucket: { Value: { Ref: "BoardRetainedBucket" } },
      AuditArchiveBucket: { Value: { Ref: "BoardAuditArchiveBucket" } },
      KmsKeyId: { Value: { Ref: "BoardKmsKey" } },
      KmsKeyArn: { Value: { "Fn::GetAtt": ["BoardKmsKey", "Arn"] } },
      ComputeRoleArn: { Value: { "Fn::GetAtt": ["BoardAmplifyComputeRole", "Arn"] } },
      AuditArchiverRoleArn: { Value: { "Fn::GetAtt": ["BoardAuditArchiverRole", "Arn"] } },
    },
  };
}

export function buildBoardBackendStackPlan({
  accountId,
  region = "us-east-1",
} = {}) {
  if (!/^\d{12}$/.test(accountId || "")) {
    throw new Error("accountId must contain 12 digits");
  }
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
    throw new Error("region must be an AWS region identifier");
  }
  return {
    ...BOARD_BACKEND,
    accountId,
    region,
    tableArn: `arn:aws:dynamodb:${region}:${accountId}:table/${BOARD_BACKEND.tableName}`,
    documentsTableArn: `arn:aws:dynamodb:${region}:${accountId}:table/${BOARD_BACKEND.documentsTableName}`,
    auditTableArn: `arn:aws:dynamodb:${region}:${accountId}:table/${BOARD_BACKEND.auditTableName}`,
    computeRoleArn: `arn:aws:iam::${accountId}:role/${BOARD_BACKEND.computeRoleName}`,
    auditArchiverRoleArn: `arn:aws:iam::${accountId}:role/${BOARD_BACKEND.auditArchiverRoleName}`,
    template: buildBoardBackendTemplate(),
  };
}
