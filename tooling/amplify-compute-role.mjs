export const AMPLIFY_COMPUTE_APPLICATIONS = Object.freeze({
  community: Object.freeze({
    appId: "d2xb9ethk5a24j",
    branchName: "main",
    defaultTableName: "PGPZCommunityNextAuth",
    roleName: "PgpzCommunityAmplifyMainCompute",
  }),
  coalition: Object.freeze({
    appId: "d1ve1xrza71r7u",
    branchName: "main",
    defaultTableName: "PGPZCoalitionNextAuth",
    defaultAdditionalTableNames: ["PGPZCommunityNextAuth"],
    roleName: "PgpzCoalitionAmplifyMainCompute",
  }),
});

const primaryDynamoActions = [
  "dynamodb:BatchWriteItem",
  "dynamodb:DeleteItem",
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:Query",
  "dynamodb:Scan",
  "dynamodb:TransactWriteItems",
  "dynamodb:UpdateItem",
];

const synchronizedDynamoActions = [
  "dynamodb:Query",
  "dynamodb:TransactWriteItems",
  "dynamodb:UpdateItem",
];

const tableResources = ({ accountId, region, tableName }) => {
  const tableArn = `arn:aws:dynamodb:${region}:${accountId}:table/${tableName}`;
  return [tableArn, `${tableArn}/index/*`];
};

export function buildAmplifyComputeTrustPolicy() {
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

export function buildAmplifyComputePermissionPolicy({
  accountId,
  region,
  tableName,
  additionalTableNames = [],
  bucket,
  prefix,
  sesIdentityArn,
  fromAddress,
}) {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, "");
  if (!normalizedPrefix) throw new Error("prefix is required");
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "ApplicationTable",
        Effect: "Allow",
        Action: primaryDynamoActions,
        Resource: tableResources({ accountId, region, tableName }),
      },
      ...(additionalTableNames.length
        ? [
            {
              Sid: "CommunityEntitlementSynchronization",
              Effect: "Allow",
              Action: synchronizedDynamoActions,
              Resource: additionalTableNames.flatMap((additionalTableName) =>
                tableResources({
                  accountId,
                  region,
                  tableName: additionalTableName,
                }),
              ),
            },
          ]
        : []),
      {
        Sid: "ListPolicyUpdateObjects",
        Effect: "Allow",
        Action: ["s3:ListBucket"],
        Resource: [`arn:aws:s3:::${bucket}`],
        Condition: {
          StringLike: {
            "s3:prefix": [normalizedPrefix, `${normalizedPrefix}/*`],
          },
        },
      },
      {
        Sid: "ManagePolicyUpdateObjects",
        Effect: "Allow",
        Action: [
          "s3:DeleteObject",
          "s3:GetObject",
          "s3:PutObject",
        ],
        Resource: [`arn:aws:s3:::${bucket}/${normalizedPrefix}/*`],
      },
      {
        Sid: "SendApplicationEmail",
        Effect: "Allow",
        // Nodemailer's SESv2 transport submits the generated MIME message as
        // raw content. SES authorizes that path with SendRawEmail even though
        // the SDK command class is SendEmailCommand.
        Action: ["ses:SendEmail", "ses:SendRawEmail"],
        Resource: [sesIdentityArn],
        Condition: {
          StringEquals: { "ses:FromAddress": fromAddress },
        },
      },
    ],
  };
}

export function buildAmplifyComputeRolePlan({
  applicationName,
  accountId,
  region = "us-east-1",
  tableName,
  additionalTableNames,
  bucket,
  prefix = "policy-updates/uploads",
  sesIdentityArn,
  fromAddress,
}) {
  const application = AMPLIFY_COMPUTE_APPLICATIONS[applicationName];
  if (!application) throw new Error(`Unknown application: ${applicationName}`);
  if (!/^\d{12}$/.test(accountId)) throw new Error("accountId must contain 12 digits");
  if (!bucket?.trim()) throw new Error("bucket is required");
  if (!sesIdentityArn?.startsWith(`arn:aws:ses:${region}:${accountId}:identity/`)) {
    throw new Error("sesIdentityArn must be an SES identity ARN in the selected account and region");
  }
  if (!/^[^<>\s@]+@[^<>\s@]+$/.test(fromAddress || "")) {
    throw new Error("fromAddress must be a plain email address without a display name");
  }

  const resolvedTableName = tableName || application.defaultTableName;
  const resolvedAdditionalTableNames =
    additionalTableNames || application.defaultAdditionalTableNames || [];
  const roleArn = `arn:aws:iam::${accountId}:role/${application.roleName}`;
  return {
    applicationName,
    appId: application.appId,
    branchName: application.branchName,
    roleName: application.roleName,
    roleArn,
    inlinePolicyName: `${application.roleName}Policy`,
    trustPolicy: buildAmplifyComputeTrustPolicy(),
    permissionPolicy: buildAmplifyComputePermissionPolicy({
      accountId,
      region,
      tableName: resolvedTableName,
      additionalTableNames: resolvedAdditionalTableNames,
      bucket,
      prefix,
      sesIdentityArn,
      fromAddress,
    }),
  };
}
