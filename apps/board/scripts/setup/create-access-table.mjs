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
const tableName = valueAfter("--access-table") || process.env.BOARD_ACCESS_TABLE || "PGPZBoardAccess";
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
    const roster = existing.GlobalSecondaryIndexes?.find((index) => index.IndexName === "Roster");
    if (!roster) throw new Error(`${tableName} exists without the required Roster index`);
    console.log(`DynamoDB access table exists: ${tableName}`);
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
      { AttributeName: "rosterPk", AttributeType: "S" },
      { AttributeName: "rosterSk", AttributeType: "S" },
    ],
    GlobalSecondaryIndexes: [{
      IndexName: "Roster",
      KeySchema: [
        { AttributeName: "rosterPk", KeyType: "HASH" },
        { AttributeName: "rosterSk", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    }],
  }));
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: tableName });
  console.log(`DynamoDB access table is ACTIVE: ${tableName}`);
}

main().catch((error) => {
  console.error("Failed to set up Board access table.", error);
  process.exitCode = 1;
});
