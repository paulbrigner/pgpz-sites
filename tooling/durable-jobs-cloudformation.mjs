const APPLICATIONS = Object.freeze({
  community: Object.freeze({
    baseUrl: "https://community.pgpz.org",
    resourcePrefix: "pgpz-community-background-jobs",
    stackName: "PgpzCommunityBackgroundJobs",
    tableName: "PGPZCommunityBackgroundJobs",
  }),
  coalition: Object.freeze({
    baseUrl: "https://coalition.pgpz.org",
    resourcePrefix: "pgpz-coalition-background-jobs",
    stackName: "PgpzCoalitionBackgroundJobs",
    tableName: "PGPZCoalitionBackgroundJobs",
  }),
});

export const BACKGROUND_JOBS_INTERNAL_PATHS = Object.freeze({
  process: "/api/internal/background-jobs/process",
  reconcile: "/api/internal/background-jobs/reconcile",
});

export function backgroundJobsApplication(applicationName) {
  const application = APPLICATIONS[applicationName];
  if (!application) {
    throw new Error(`Unknown application: ${applicationName}`);
  }
  return application;
}

export function validateApplicationBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("baseUrl must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("baseUrl must use https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("baseUrl must not include credentials, a query, or a fragment");
  }
  return parsed.toString().replace(/\/$/, "");
}

const alarmActions = {
  "Fn::If": ["HasAlarmTopic", [{ Ref: "AlarmTopicArn" }], { Ref: "AWS::NoValue" }],
};

const bridgeWorkerSource = String.raw`exports.handler = async (event) => {
  const failures = [];
  for (const record of event.Records || []) {
    try {
      const response = await fetch(
        process.env.APPLICATION_BASE_URL + process.env.PROCESS_PATH,
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + process.env.INTERNAL_SECRET,
            "content-type": "application/json",
            "x-background-job-message-id": record.messageId,
            "x-background-job-receive-count":
              record.attributes?.ApproximateReceiveCount || "1",
          },
          body: record.body,
          signal: AbortSignal.timeout(25000),
        },
      );
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error("process endpoint returned " + response.status + ": " + detail);
      }
    } catch (error) {
      console.error("Background job delivery failed", {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
};
`;

const reconcilerSource = String.raw`exports.handler = async () => {
  const response = await fetch(
    process.env.APPLICATION_BASE_URL + process.env.RECONCILE_PATH,
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + process.env.INTERNAL_SECRET,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: "schedule",
        requestedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(25000),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error("reconcile endpoint returned " + response.status + ": " + detail);
  }
};
`;

function lambdaLogPolicy(functionName) {
  return {
    Effect: "Allow",
    Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
    Resource: {
      "Fn::Sub": `arn:\${AWS::Partition}:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:/aws/lambda/${functionName}:*`,
    },
  };
}

function lambdaTrustPolicy() {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  };
}

function errorAlarm({ functionLogicalId, description }) {
  return {
    Type: "AWS::CloudWatch::Alarm",
    Properties: {
      AlarmDescription: description,
      Namespace: "AWS/Lambda",
      MetricName: "Errors",
      Dimensions: [
        { Name: "FunctionName", Value: { Ref: functionLogicalId } },
      ],
      Statistic: "Sum",
      Period: 300,
      EvaluationPeriods: 1,
      DatapointsToAlarm: 1,
      Threshold: 1,
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
      TreatMissingData: "notBreaching",
      AlarmActions: alarmActions,
    },
  };
}

export function buildDurableJobsTemplate({ applicationName }) {
  const application = backgroundJobsApplication(applicationName);
  const queueName = application.resourcePrefix;
  const dlqName = `${queueName}-dlq`;

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `Durable background-job infrastructure for PGPZ ${applicationName}`,
    Parameters: {
      ApplicationBaseUrl: {
        Type: "String",
        Default: application.baseUrl,
        AllowedValues: [application.baseUrl],
        Description: "Canonical HTTPS origin for the branded application",
      },
      InternalSecret: {
        Type: "String",
        NoEcho: true,
        MinLength: 32,
        Description: "Bearer secret shared only by the bridge Lambdas and application",
      },
      AlarmTopicArn: {
        Type: "String",
        Default: "",
        Description: "Optional SNS topic ARN for alarm notifications",
      },
      WorkersEnabled: {
        Type: "String",
        Default: "false",
        AllowedValues: ["true", "false"],
        Description: "Explicit cutover switch for queue consumption and scheduled reconciliation",
      },
    },
    Conditions: {
      HasAlarmTopic: {
        "Fn::Not": [{ "Fn::Equals": [{ Ref: "AlarmTopicArn" }, ""] }],
      },
      BackgroundWorkersEnabled: {
        "Fn::Equals": [{ Ref: "WorkersEnabled" }, "true"],
      },
    },
    Resources: {
      JobsTable: {
        Type: "AWS::DynamoDB::Table",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          TableName: application.tableName,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
            { AttributeName: "GSI1PK", AttributeType: "S" },
            { AttributeName: "GSI1SK", AttributeType: "S" },
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
            { Key: "Project", Value: "pgpz" },
            { Key: "Application", Value: applicationName },
            { Key: "DataClassification", Value: "operational" },
          ],
        },
      },
      DeadLetterQueue: {
        Type: "AWS::SQS::Queue",
        Properties: {
          QueueName: dlqName,
          MessageRetentionPeriod: 1209600,
          SqsManagedSseEnabled: true,
          RedriveAllowPolicy: {
            redrivePermission: "byQueue",
            sourceQueueArns: [
              {
                "Fn::Sub": `arn:\${AWS::Partition}:sqs:\${AWS::Region}:\${AWS::AccountId}:${queueName}`,
              },
            ],
          },
          Tags: [
            { Key: "Project", Value: "pgpz" },
            { Key: "Application", Value: applicationName },
          ],
        },
      },
      JobsQueue: {
        Type: "AWS::SQS::Queue",
        Properties: {
          QueueName: queueName,
          MessageRetentionPeriod: 1209600,
          VisibilityTimeout: 180,
          SqsManagedSseEnabled: true,
          RedrivePolicy: {
            deadLetterTargetArn: { "Fn::GetAtt": ["DeadLetterQueue", "Arn"] },
            maxReceiveCount: 5,
          },
          Tags: [
            { Key: "Project", Value: "pgpz" },
            { Key: "Application", Value: applicationName },
          ],
        },
      },
      BridgeWorkerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: lambdaTrustPolicy(),
          Policies: [
            {
              PolicyName: "BridgeWorkerRuntime",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  lambdaLogPolicy(`${queueName}-bridge`),
                  {
                    Effect: "Allow",
                    Action: [
                      "sqs:ChangeMessageVisibility",
                      "sqs:DeleteMessage",
                      "sqs:GetQueueAttributes",
                      "sqs:ReceiveMessage",
                    ],
                    Resource: { "Fn::GetAtt": ["JobsQueue", "Arn"] },
                  },
                ],
              },
            },
          ],
          Tags: [
            { Key: "Project", Value: "pgpz" },
            { Key: "Application", Value: applicationName },
          ],
        },
      },
      BridgeWorkerFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: `${queueName}-bridge`,
          Description: `Forwards ${applicationName} SQS work to the authenticated application endpoint`,
          Runtime: "nodejs22.x",
          Handler: "index.handler",
          Role: { "Fn::GetAtt": ["BridgeWorkerRole", "Arn"] },
          Timeout: 30,
          MemorySize: 256,
          ReservedConcurrentExecutions: 5,
          Code: { ZipFile: bridgeWorkerSource },
          Environment: {
            Variables: {
              APPLICATION_BASE_URL: { Ref: "ApplicationBaseUrl" },
              PROCESS_PATH: BACKGROUND_JOBS_INTERNAL_PATHS.process,
              INTERNAL_SECRET: { Ref: "InternalSecret" },
            },
          },
          Tags: [
            { Key: "Project", Value: "pgpz" },
            { Key: "Application", Value: applicationName },
          ],
        },
      },
      BridgeWorkerLogGroup: {
        Type: "AWS::Logs::LogGroup",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          LogGroupName: {
            "Fn::Sub": [
              "/aws/lambda/${FunctionName}",
              { FunctionName: { Ref: "BridgeWorkerFunction" } },
            ],
          },
          RetentionInDays: 30,
        },
      },
      BridgeWorkerEventSource: {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: {
          EventSourceArn: { "Fn::GetAtt": ["JobsQueue", "Arn"] },
          FunctionName: { Ref: "BridgeWorkerFunction" },
          BatchSize: 1,
          Enabled: {
            "Fn::If": ["BackgroundWorkersEnabled", true, false],
          },
          FunctionResponseTypes: ["ReportBatchItemFailures"],
          ScalingConfig: { MaximumConcurrency: 5 },
        },
      },
      ReconcilerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: lambdaTrustPolicy(),
          Policies: [
            {
              PolicyName: "ReconcilerRuntime",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [lambdaLogPolicy(`${queueName}-reconciler`)],
              },
            },
          ],
          Tags: [
            { Key: "Project", Value: "pgpz" },
            { Key: "Application", Value: applicationName },
          ],
        },
      },
      ReconcilerFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: `${queueName}-reconciler`,
          Description: `Requests reconciliation of stalled ${applicationName} background jobs`,
          Runtime: "nodejs22.x",
          Handler: "index.handler",
          Role: { "Fn::GetAtt": ["ReconcilerRole", "Arn"] },
          Timeout: 30,
          MemorySize: 128,
          ReservedConcurrentExecutions: 1,
          Code: { ZipFile: reconcilerSource },
          Environment: {
            Variables: {
              APPLICATION_BASE_URL: { Ref: "ApplicationBaseUrl" },
              RECONCILE_PATH: BACKGROUND_JOBS_INTERNAL_PATHS.reconcile,
              INTERNAL_SECRET: { Ref: "InternalSecret" },
            },
          },
          Tags: [
            { Key: "Project", Value: "pgpz" },
            { Key: "Application", Value: applicationName },
          ],
        },
      },
      ReconcilerLogGroup: {
        Type: "AWS::Logs::LogGroup",
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
        Properties: {
          LogGroupName: {
            "Fn::Sub": [
              "/aws/lambda/${FunctionName}",
              { FunctionName: { Ref: "ReconcilerFunction" } },
            ],
          },
          RetentionInDays: 30,
        },
      },
      ReconcileSchedule: {
        Type: "AWS::Events::Rule",
        Properties: {
          Description: `Reconcile stalled ${applicationName} background jobs`,
          ScheduleExpression: "rate(5 minutes)",
          State: {
            "Fn::If": ["BackgroundWorkersEnabled", "ENABLED", "DISABLED"],
          },
          Targets: [
            {
              Arn: { "Fn::GetAtt": ["ReconcilerFunction", "Arn"] },
              Id: "ReconcilerFunction",
              RetryPolicy: {
                MaximumEventAgeInSeconds: 300,
                MaximumRetryAttempts: 2,
              },
            },
          ],
        },
      },
      ReconcileSchedulePermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { Ref: "ReconcilerFunction" },
          Principal: "events.amazonaws.com",
          SourceArn: { "Fn::GetAtt": ["ReconcileSchedule", "Arn"] },
        },
      },
      DeadLetterQueueAlarm: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmDescription: `${applicationName} background jobs have reached the dead-letter queue`,
          Namespace: "AWS/SQS",
          MetricName: "ApproximateNumberOfMessagesVisible",
          Dimensions: [
            { Name: "QueueName", Value: { "Fn::GetAtt": ["DeadLetterQueue", "QueueName"] } },
          ],
          Statistic: "Maximum",
          Period: 300,
          EvaluationPeriods: 1,
          DatapointsToAlarm: 1,
          Threshold: 1,
          ComparisonOperator: "GreaterThanOrEqualToThreshold",
          TreatMissingData: "notBreaching",
          AlarmActions: alarmActions,
        },
      },
      OldestQueuedMessageAlarm: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmDescription: `${applicationName} background jobs have been queued for more than ten minutes`,
          Namespace: "AWS/SQS",
          MetricName: "ApproximateAgeOfOldestMessage",
          Dimensions: [
            { Name: "QueueName", Value: { "Fn::GetAtt": ["JobsQueue", "QueueName"] } },
          ],
          Statistic: "Maximum",
          Period: 300,
          EvaluationPeriods: 2,
          DatapointsToAlarm: 2,
          Threshold: 600,
          ComparisonOperator: "GreaterThanThreshold",
          TreatMissingData: "notBreaching",
          AlarmActions: alarmActions,
        },
      },
      BridgeWorkerErrorAlarm: errorAlarm({
        functionLogicalId: "BridgeWorkerFunction",
        description: `${applicationName} background-job bridge returned errors`,
      }),
      ReconcilerErrorAlarm: errorAlarm({
        functionLogicalId: "ReconcilerFunction",
        description: `${applicationName} background-job reconciler returned errors`,
      }),
    },
    Outputs: {
      JobsTableName: { Value: { Ref: "JobsTable" } },
      JobsTableArn: { Value: { "Fn::GetAtt": ["JobsTable", "Arn"] } },
      QueueUrl: { Value: { Ref: "JobsQueue" } },
      QueueArn: { Value: { "Fn::GetAtt": ["JobsQueue", "Arn"] } },
      DeadLetterQueueUrl: { Value: { Ref: "DeadLetterQueue" } },
      DeadLetterQueueArn: { Value: { "Fn::GetAtt": ["DeadLetterQueue", "Arn"] } },
      BridgeWorkerFunctionName: { Value: { Ref: "BridgeWorkerFunction" } },
      ReconcilerFunctionName: { Value: { Ref: "ReconcilerFunction" } },
    },
  };
}

export function buildDurableJobsStackPlan({
  applicationName,
  baseUrl,
  region = "us-east-1",
  accountId,
  alarmTopicArn = "",
}) {
  const application = backgroundJobsApplication(applicationName);
  if (!/^\d{12}$/.test(accountId || "")) {
    throw new Error("accountId must contain 12 digits");
  }
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
    throw new Error("region must be an AWS region identifier");
  }
  if (alarmTopicArn && !alarmTopicArn.startsWith(`arn:aws:sns:${region}:${accountId}:`)) {
    throw new Error("alarmTopicArn must be an SNS topic ARN in the selected account and region");
  }
  const resolvedBaseUrl = validateApplicationBaseUrl(baseUrl || application.baseUrl);
  if (resolvedBaseUrl !== application.baseUrl) {
    throw new Error(
      `baseUrl for ${applicationName} must be its canonical origin ${application.baseUrl}`,
    );
  }
  return {
    applicationName,
    stackName: application.stackName,
    baseUrl: resolvedBaseUrl,
    region,
    accountId,
    alarmTopicArn,
    tableName: application.tableName,
    queueName: application.resourcePrefix,
    queueArn: `arn:aws:sqs:${region}:${accountId}:${application.resourcePrefix}`,
    template: buildDurableJobsTemplate({ applicationName }),
  };
}
