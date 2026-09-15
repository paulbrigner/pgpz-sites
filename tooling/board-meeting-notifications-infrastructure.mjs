import { readFileSync } from "node:fs";

/** Board-owned resources; no shared queues, recipients or application secrets. */
export function boardMeetingNotificationResources(tags) {
  const get = (name) => ({ "Fn::GetAtt": [name, "Arn"] });
  const allow = (Action, Resource, Condition) => ({ Effect: "Allow", Action, Resource, ...(Condition ? { Condition } : {}) });
  const alarm = (name, namespace, metric, dimensions, threshold = 0, statistic = "Sum") => ({ Type: "AWS::CloudWatch::Alarm", Properties: {
    AlarmName: name, Namespace: namespace, MetricName: metric, Dimensions: dimensions, Statistic: statistic,
    Period: 300, EvaluationPeriods: 1, Threshold: threshold, ComparisonOperator: "GreaterThanThreshold", TreatMissingData: "notBreaching",
  } });
  const functionDimensions = [{ Name: "FunctionName", Value: { Ref: "BoardMeetingNotificationsFunction" } }];
  return {
    BoardMeetingNotificationsFailures: { Type: "AWS::S3::Bucket", DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain", Properties: {
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      VersioningConfiguration: { Status: "Enabled" }, Tags: tags,
    } },
    BoardMeetingNotificationsFailuresPolicy: { Type: "AWS::S3::BucketPolicy", Properties: {
      Bucket: { Ref: "BoardMeetingNotificationsFailures" }, PolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Deny", Principal: "*", Action: "s3:*", Resource: [get("BoardMeetingNotificationsFailures"), { "Fn::Sub": "${BoardMeetingNotificationsFailures.Arn}/*" }], Condition: { Bool: { "aws:SecureTransport": "false" } } }] },
    } },
    BoardMeetingNotificationsLogGroup: { Type: "AWS::Logs::LogGroup", DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain", Properties: { LogGroupName: "/aws/lambda/PgpzBoardMeetingNotifications", RetentionInDays: 90, Tags: tags } },
    BoardMeetingNotificationsRole: { Type: "AWS::IAM::Role", Properties: {
      RoleName: "PgpzBoardMeetingNotifications", AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }] },
      Policies: [{ PolicyName: "BoardMeetingNotificationDelivery", PolicyDocument: { Version: "2012-10-17", Statement: [
        allow(["dynamodb:GetRecords", "dynamodb:GetShardIterator", "dynamodb:DescribeStream"], { "Fn::GetAtt": ["BoardMeetingsTable", "StreamArn"] }),
        // ListStreams has no resource-level IAM support; only metadata enumeration is wildcarded.
        allow(["dynamodb:ListStreams"], "*", { StringEquals: { "aws:RequestedRegion": { Ref: "AWS::Region" } } }),
        allow(["dynamodb:GetItem", "dynamodb:Query", "dynamodb:ConditionCheckItem"], get("BoardMeetingsTable")),
        allow(["dynamodb:GetItem", "dynamodb:ConditionCheckItem"], get("BoardAccessTable")),
        allow(["dynamodb:PutItem"], get("BoardMeetingsTable"), { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["MEETING_NOTICE#*"] } }),
        allow(["kms:Decrypt", "kms:DescribeKey"], get("BoardKmsKey")),
        allow(["ses:SendEmail"], { "Fn::Sub": "arn:${AWS::Partition}:ses:${AWS::Region}:${AWS::AccountId}:identity/pgpz.org" }, { StringEquals: { "ses:FromAddress": "board@pgpz.org" } }),
        allow(["logs:CreateLogStream", "logs:PutLogEvents"], { "Fn::Sub": "${BoardMeetingNotificationsLogGroup.Arn}:*" }),
        allow(["s3:PutObject"], { "Fn::Sub": "${BoardMeetingNotificationsFailures.Arn}/*" }, { StringEquals: { "s3:ResourceAccount": { Ref: "AWS::AccountId" } } }),
        allow(["s3:ListBucket"], get("BoardMeetingNotificationsFailures")),
      ] } }], Tags: tags,
    } },
    BoardMeetingNotificationsFunction: { Type: "AWS::Lambda::Function", DependsOn: ["BoardMeetingNotificationsLogGroup"], Properties: {
      FunctionName: "PgpzBoardMeetingNotifications", Runtime: "nodejs22.x", Handler: "index.handler", Role: get("BoardMeetingNotificationsRole"), Timeout: 120, MemorySize: 256,
      Environment: { Variables: { MEETINGS_TABLE: { Ref: "BoardMeetingsTable" }, ACCESS_TABLE: { Ref: "BoardAccessTable" }, SITE_URL: { Ref: "BoardSiteOrigin" }, EMAIL_FROM: "PGPZ Board <board@pgpz.org>", DELIVERY_ENABLED: { Ref: "BoardMeetingNotificationDelivery" } } },
      Code: { ZipFile: readFileSync(new URL("../apps/board/workers/meeting-notifications.cjs", import.meta.url), "utf8") }, Tags: tags,
    } },
    BoardMeetingNotificationsEventSource: { Type: "AWS::Lambda::EventSourceMapping", Properties: {
      EventSourceArn: { "Fn::GetAtt": ["BoardMeetingsTable", "StreamArn"] }, FunctionName: { Ref: "BoardMeetingNotificationsFunction" },
      StartingPosition: "TRIM_HORIZON", BatchSize: 10, MaximumBatchingWindowInSeconds: 1,
      BisectBatchOnFunctionError: true, FunctionResponseTypes: ["ReportBatchItemFailures"], MaximumRetryAttempts: 10, MaximumRecordAgeInSeconds: 3600,
      DestinationConfig: { OnFailure: { Destination: get("BoardMeetingNotificationsFailures") } }, Enabled: true,
      FilterCriteria: { Filters: [{ Pattern: JSON.stringify({ eventName: ["INSERT"], dynamodb: { NewImage: { entityType: { S: ["MEETING_NOTIFICATION_EVENT"] } } } }) }] },
    } },
    BoardMeetingNotificationsErrorMetric: { Type: "AWS::Logs::MetricFilter", Properties: {
      LogGroupName: { Ref: "BoardMeetingNotificationsLogGroup" }, FilterPattern: '?"NOTIFICATION_EVENT_FAILED" ?"NOTIFICATION_SEND_UNKNOWN"',
      MetricTransformations: [{ MetricNamespace: "PGPZ/Board", MetricName: "MeetingNotificationFailures", MetricValue: "1", DefaultValue: 0 }],
    } },
    BoardMeetingNotificationsDeliveryAlarm: alarm("PgpzBoardMeetingNotificationFailures", "PGPZ/Board", "MeetingNotificationFailures", []),
    BoardMeetingNotificationsErrorsAlarm: alarm("PgpzBoardMeetingNotificationsErrors", "AWS/Lambda", "Errors", functionDimensions),
    BoardMeetingNotificationsAgeAlarm: alarm("PgpzBoardMeetingNotificationsBacklog", "AWS/Lambda", "IteratorAge", functionDimensions, 300000, "Maximum"),
    BoardMeetingNotificationsDestinationAlarm: alarm("PgpzBoardMeetingNotificationsDestinationErrors", "AWS/Lambda", "DestinationDeliveryFailures", functionDimensions),
  };
}
