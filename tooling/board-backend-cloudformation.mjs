export const BOARD_BACKEND = Object.freeze({
  applicationName: "board",
  stackName: "PgpzBoardBackend",
  tableName: "PGPZBoardNextAuth",
  computeRoleName: "PgpzBoardAmplifyMainCompute",
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

export function buildBoardBackendTemplate() {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Isolated authentication backend for the private PGPZ Board portal",
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
          TimeToLiveSpecification: {
            AttributeName: "expires",
            Enabled: true,
          },
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true,
          },
          DeletionProtectionEnabled: true,
          SSESpecification: { SSEEnabled: true },
          Tags: [
            ...resourceTags,
            { Key: "DataClassification", Value: "confidential" },
          ],
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
          ],
          Tags: [...resourceTags],
        },
      },
    },
    Outputs: {
      TableName: { Value: { Ref: "BoardAuthTable" } },
      TableArn: { Value: { "Fn::GetAtt": ["BoardAuthTable", "Arn"] } },
      ComputeRoleArn: {
        Value: { "Fn::GetAtt": ["BoardAmplifyComputeRole", "Arn"] },
      },
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
    computeRoleArn: `arn:aws:iam::${accountId}:role/${BOARD_BACKEND.computeRoleName}`,
    template: buildBoardBackendTemplate(),
  };
}
