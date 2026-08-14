#!/usr/bin/env node
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const region = valueAfter("--region") || process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
const tableName = valueAfter("--meetings-table") || process.env.BOARD_MEETINGS_TABLE || "PGPZBoardMeetings";
const client = new DynamoDBClient({ region });

async function describe() {
  try {
    return (await client.send(new DescribeTableCommand({ TableName: tableName }))).Table;
  } catch (error) {
    if (error?.name === "ResourceNotFoundException") return null;
    throw error;
  }
}

async function main() {
  const existing = await describe();
  if (existing) {
    const timeline = existing.GlobalSecondaryIndexes?.find((index) => index.IndexName === "Timeline");
    if (!timeline) throw new Error(`${tableName} exists without the required Timeline index`);
    console.log(`DynamoDB meetings table exists: ${tableName}`);
    return;
  }
  await client.send(new CreateTableCommand({
    TableName: tableName,
    BillingMode: "PAY_PER_REQUEST",
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" },
      { AttributeName: "sk", AttributeType: "S" },
      { AttributeName: "timelinePk", AttributeType: "S" },
      { AttributeName: "timelineSk", AttributeType: "S" },
    ],
    GlobalSecondaryIndexes: [{
      IndexName: "Timeline",
      KeySchema: [
        { AttributeName: "timelinePk", KeyType: "HASH" },
        { AttributeName: "timelineSk", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    }],
  }));
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: tableName });
  console.log(`DynamoDB meetings table is ACTIVE: ${tableName}`);
}

main().catch((error) => {
  console.error("Failed to set up Board meetings table.", error);
  process.exitCode = 1;
});
