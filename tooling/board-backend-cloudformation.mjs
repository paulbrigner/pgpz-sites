export const BOARD_BACKEND = Object.freeze({
  applicationName: "board",
  stackName: "PgpzBoardBackend",
  tableName: "PGPZBoardNextAuth",
  documentsTableName: "PGPZBoardDocuments",
  auditTableName: "PGPZBoardAuditLog",
  accessTableName: "PGPZBoardAccess",
  meetingsTableName: "PGPZBoardMeetings",
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
  "dynamodb:TransactWriteItems",
]);

/** Board access registry: indexed reads and conditional/transactional writes.
 * Profiles are mutable, but revisions are immutable by application contract. */
export const BOARD_ACCESS_ACTIONS = Object.freeze([
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:Query",
  "dynamodb:TransactWriteItems",
]);

/** Board meetings: indexed reads and conditional/transactional writes, with
 * no delete or scan. Revisions and finalized child records are retained. */
export const BOARD_MEETINGS_ACTIONS = Object.freeze([
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:Query",
  "dynamodb:TransactWriteItems",
]);

/** Web compute S3 on retained objects: never delete. */
export const BOARD_RETAINED_S3_ACTIONS = Object.freeze([
  "s3:PutObject",
  "s3:GetObject",
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
  const bucketSubstitution = `\${${bucket}}`;
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "DenyInsecureTransport",
        Effect: "Deny",
        Principal: "*",
        Action: readWrite,
        Resource: [
          { "Fn::Sub": `arn:${"${AWS::Partition}"}:s3:::${bucketSubstitution}` },
          { "Fn::Sub": `arn:${"${AWS::Partition}"}:s3:::${bucketSubstitution}/*` },
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
    Description: "Isolated auth, governance-document, meeting, and audit backend for the private PGPZ Board portal",
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
      BoardSiteOrigin: {
        Type: "String",
        Default: "https://board.pgpz.org",
        Description: "Exact origin allowed to PUT directly to the upload staging bucket.",
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
            { AttributeName: "meetingPk", AttributeType: "S" },
            { AttributeName: "meetingSort", AttributeType: "S" },
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
            {
              IndexName: "MeetingDocuments",
              KeySchema: [
                { AttributeName: "meetingPk", KeyType: "HASH" },
                { AttributeName: "meetingSort", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "INCLUDE", NonKeyAttributes: ["documentId"] },
            },
          ],
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
          DeletionProtectionEnabled: true,
          SSESpecification: { SSEEnabled: true, SSEType: "KMS", KMSMasterKeyId: { Ref: "BoardKmsKey" } },
          // Deliberately no TimeToLiveSpecification: documents are retained.
          Tags: confidentialTags,
        },
      },

      // ---- Board meeting domain: retained aggregate, child records, revisions ----
      BoardMeetingsTable: {
        Type: "AWS::DynamoDB::Table",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          TableName: BOARD_BACKEND.meetingsTableName,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
            { AttributeName: "timelinePk", AttributeType: "S" },
            { AttributeName: "timelineSk", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "Timeline",
              KeySchema: [
                { AttributeName: "timelinePk", KeyType: "HASH" },
                { AttributeName: "timelineSk", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
          DeletionProtectionEnabled: true,
          SSESpecification: { SSEEnabled: true, SSEType: "KMS", KMSMasterKeyId: { Ref: "BoardKmsKey" } },
          // Deliberately no TTL: meeting records are governance evidence.
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
          StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
          Tags: confidentialTags,
        },
      },

      // ---- Board-owned access registry: profile + immutable revisions, NO TTL ----
      BoardAccessTable: {
        Type: "AWS::DynamoDB::Table",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          TableName: BOARD_BACKEND.accessTableName,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
            { AttributeName: "rosterPk", AttributeType: "S" },
            { AttributeName: "rosterSk", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "Roster",
              KeySchema: [
                { AttributeName: "rosterPk", KeyType: "HASH" },
                { AttributeName: "rosterSk", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
          DeletionProtectionEnabled: true,
          SSESpecification: { SSEEnabled: true, SSEType: "KMS", KMSMasterKeyId: { Ref: "BoardKmsKey" } },
          // Deliberately no TimeToLiveSpecification: access history is retained.
          Tags: confidentialTags,
        },
      },

      // ---- Board-only KMS key (rotation on, services via key policy) ----
      BoardKmsKey: {
        Type: "AWS::KMS::Key",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          Description: "Board-only encryption key for governance documents, meetings, and the audit ledger",
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
          PublicAccessBlockConfiguration: publicAccessBlock,
          ...bucketOwnerEnforced,
          LifecycleConfiguration: {
            Rules: [
              {
                Id: "ExpireStaging",
                Status: "Enabled",
                Prefix: "board/staging/",
                ExpirationInDays: { Ref: "BoardStagingExpirationDays" },
              },
            ],
          },
          // Exact-origin CORS so the Board app can PUT directly to staging.
          CorsConfiguration: {
            CorsRules: [
              {
                Id: "BoardDirectUpload",
                AllowedOrigins: [{ Ref: "BoardSiteOrigin" }],
                AllowedMethods: ["PUT", "POST"],
                AllowedHeaders: ["*"],
                ExposedHeaders: ["ETag"],
                MaxAge: 3000,
              },
            ],
          },
          Tags: resourceTags,
        },
      },
      BoardStagingBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: { Ref: "BoardStagingBucket" },
          PolicyDocument: tlsOnlyBucketPolicy("BoardStagingBucket"),
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
          ObjectLockEnabled: true,
          ObjectLockConfiguration: objectLockDefault("BoardObjectLockMode", "BoardRetentionDays"),
          PublicAccessBlockConfiguration: publicAccessBlock,
          ...bucketOwnerEnforced,
          Tags: confidentialTags,
        },
      },
      BoardRetainedBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: { Ref: "BoardRetainedBucket" },
          PolicyDocument: tlsOnlyBucketPolicy("BoardRetainedBucket"),
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
          ObjectLockEnabled: true,
          ObjectLockConfiguration: objectLockDefault("BoardObjectLockMode", "BoardRetentionDays"),
          PublicAccessBlockConfiguration: publicAccessBlock,
          ...bucketOwnerEnforced,
          Tags: confidentialTags,
        },
      },
      BoardAuditArchiveBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: { Ref: "BoardAuditArchiveBucket" },
          PolicyDocument: tlsOnlyBucketPolicy("BoardAuditArchiveBucket"),
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
                  {
                    Sid: "DiscoverAuditStream",
                    Effect: "Allow",
                    Action: "dynamodb:ListStreams",
                    Resource: "*",
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
                    Action: "s3:PutObject",
                    Resource: { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardAuditArchiveBucket}/events/*" },
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
            {
              PolicyName: "WriteAuditArchiverLogs",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Sid: "WriteDedicatedLogGroup",
                    Effect: "Allow",
                    Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
                    Resource: { "Fn::Sub": "${BoardAuditArchiverLogGroup.Arn}:*" },
                  },
                ],
              },
            },
          ],
          Tags: confidentialTags,
        },
      },

      BoardAuditArchiverLogGroup: {
        Type: "AWS::Logs::LogGroup",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          LogGroupName: "/aws/lambda/PgpzBoardAuditArchiver",
          RetentionInDays: 365,
          Tags: confidentialTags,
        },
      },

      BoardAuditArchiverFunction: {
        Type: "AWS::Lambda::Function",
        DependsOn: ["BoardAuditArchiverLogGroup"],
        Properties: {
          FunctionName: "PgpzBoardAuditArchiver",
          Description: "Copies every Board audit-ledger stream record into the independently permissioned WORM archive",
          Runtime: "nodejs22.x",
          Handler: "index.handler",
          Role: { "Fn::GetAtt": ["BoardAuditArchiverRole", "Arn"] },
          Timeout: 30,
          MemorySize: 256,
          Environment: {
            Variables: {
              ARCHIVE_BUCKET: { Ref: "BoardAuditArchiveBucket" },
            },
          },
          Code: {
            ZipFile: [
              'const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");',
              "const s3 = new S3Client({});",
              "exports.handler = async (event) => {",
              "  const failures = [];",
              "  for (const record of event.Records || []) {",
              "    try {",
              "      const occurred = record.dynamodb?.ApproximateCreationDateTime || 0;",
              "      const date = new Date(occurred * 1000).toISOString().slice(0, 10);",
              "      const eventId = String(record.eventID || '').replace(/[^A-Za-z0-9_-]/g, '_');",
              "      if (!eventId) throw new Error('DynamoDB stream record is missing eventID');",
              "      const body = JSON.stringify({",
              "        archiveSchemaVersion: 1,",
              "        archivedAt: new Date().toISOString(),",
              "        eventID: record.eventID,",
              "        eventName: record.eventName,",
              "        eventSourceARN: record.eventSourceARN,",
              "        awsRegion: record.awsRegion,",
              "        dynamodb: record.dynamodb,",
              "      });",
              "      await s3.send(new PutObjectCommand({",
              "        Bucket: process.env.ARCHIVE_BUCKET,",
              "        Key: `events/${date}/${eventId}.json`,",
              "        Body: body,",
              "        ContentType: 'application/json',",
              "      }));",
              "    } catch (error) {",
              "      console.error('Unable to archive Board audit record', { eventID: record.eventID, error });",
              "      failures.push({ itemIdentifier: record.eventID });",
              "    }",
              "  }",
              "  return { batchItemFailures: failures };",
              "};",
            ].join("\n"),
          },
          Tags: confidentialTags,
        },
      },

      BoardAuditArchiverEventSource: {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: {
          EventSourceArn: { "Fn::GetAtt": ["BoardAuditLogTable", "StreamArn"] },
          FunctionName: { Ref: "BoardAuditArchiverFunction" },
          StartingPosition: "TRIM_HORIZON",
          BatchSize: 100,
          BisectBatchOnFunctionError: true,
          FunctionResponseTypes: ["ReportBatchItemFailures"],
          Enabled: true,
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
                    Sid: "BoardAccessRegistry",
                    Effect: "Allow",
                    Action: [...BOARD_ACCESS_ACTIONS],
                    Resource: [
                      { "Fn::GetAtt": ["BoardAccessTable", "Arn"] },
                      { "Fn::Sub": "${BoardAccessTable.Arn}/index/*" },
                    ],
                  },
                  {
                    Sid: "BoardMeetingsNoDelete",
                    Effect: "Allow",
                    Action: [...BOARD_MEETINGS_ACTIONS],
                    Resource: [
                      { "Fn::GetAtt": ["BoardMeetingsTable", "Arn"] },
                      { "Fn::Sub": "${BoardMeetingsTable.Arn}/index/*" },
                    ],
                  },
                  {
                    Sid: "StagingPutGetDelete",
                    Effect: "Allow",
                    Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
                    Resource: { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardStagingBucket}/board/staging/*" },
                  },
                  {
                    Sid: "RetainedPutGetNoDelete",
                    Effect: "Allow",
                    Action: [...BOARD_RETAINED_S3_ACTIONS],
                    Resource: { "Fn::Sub": "arn:${AWS::Partition}:s3:::${BoardRetainedBucket}/board/objects/*" },
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
            {
              PolicyName: "BoardAuthenticationEmail",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Sid: "BoardSenderOnly",
                    Effect: "Allow",
                    Action: ["ses:SendEmail", "ses:SendRawEmail"],
                    Resource: { "Fn::Sub": "arn:${AWS::Partition}:ses:${AWS::Region}:${AWS::AccountId}:identity/pgpz.org" },
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
      BoardAccessTableErrorAlarm: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmName: "PgpzBoardAccessTableSystemErrors",
          ComparisonOperator: "GreaterThanThreshold",
          EvaluationPeriods: 1,
          Threshold: 0,
          MetricName: "SystemErrors",
          Namespace: "AWS/DynamoDB",
          Statistic: "Sum",
          Period: 300,
          Dimensions: [{ Name: "TableName", Value: BOARD_BACKEND.accessTableName }],
        },
      },
      BoardMeetingsTableErrorAlarm: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmName: "PGPZBoardMeetingsTableSystemErrors",
          ComparisonOperator: "GreaterThanThreshold",
          EvaluationPeriods: 1,
          Threshold: 0,
          MetricName: "SystemErrors",
          Namespace: "AWS/DynamoDB",
          Statistic: "Sum",
          Period: 300,
          Dimensions: [{ Name: "TableName", Value: BOARD_BACKEND.meetingsTableName }],
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
      AccessTableName: { Value: { Ref: "BoardAccessTable" } },
      AccessTableArn: { Value: { "Fn::GetAtt": ["BoardAccessTable", "Arn"] } },
      MeetingsTableName: { Value: { Ref: "BoardMeetingsTable" } },
      MeetingsTableArn: { Value: { "Fn::GetAtt": ["BoardMeetingsTable", "Arn"] } },
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
    accessTableArn: `arn:aws:dynamodb:${region}:${accountId}:table/${BOARD_BACKEND.accessTableName}`,
    meetingsTableArn: `arn:aws:dynamodb:${region}:${accountId}:table/${BOARD_BACKEND.meetingsTableName}`,
    computeRoleArn: `arn:aws:iam::${accountId}:role/${BOARD_BACKEND.computeRoleName}`,
    auditArchiverRoleArn: `arn:aws:iam::${accountId}:role/${BOARD_BACKEND.auditArchiverRoleName}`,
    template: buildBoardBackendTemplate(),
  };
}
