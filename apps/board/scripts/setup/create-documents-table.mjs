#!/usr/bin/env node
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const region = valueAfter("--region") || process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
const tableName = valueAfter("--documents-table") || process.env.BOARD_DOCUMENTS_TABLE || "PGPZBoardDocuments";
const client = new DynamoDBClient({ region });

async function describe() {
  try { return (await client.send(new DescribeTableCommand({ TableName: tableName }))).Table; }
  catch (error) { if (error?.name === "ResourceNotFoundException") return null; throw error; }
}

const meetingIndex = {
  IndexName: "MeetingDocuments",
  KeySchema: [
    { AttributeName: "meetingPk", KeyType: "HASH" },
    { AttributeName: "meetingSort", KeyType: "RANGE" },
  ],
  Projection: { ProjectionType: "INCLUDE", NonKeyAttributes: ["documentId"] },
};

async function main() {
  const existing = await describe();
  if (existing) {
    if (existing.GlobalSecondaryIndexes?.some((index) => index.IndexName === meetingIndex.IndexName)) {
      console.log(`DynamoDB documents table and MeetingDocuments index exist: ${tableName}`);
      return;
    }
    await client.send(new UpdateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: "meetingPk", AttributeType: "S" },
        { AttributeName: "meetingSort", AttributeType: "S" },
      ],
      GlobalSecondaryIndexUpdates: [{ Create: meetingIndex }],
    }));
    await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: tableName });
    console.log(`Added MeetingDocuments index to DynamoDB documents table: ${tableName}`);
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
      { AttributeName: "pk", AttributeType: "S" }, { AttributeName: "sk", AttributeType: "S" },
      { AttributeName: "libraryPk", AttributeType: "S" }, { AttributeName: "updatedAt", AttributeType: "S" },
      { AttributeName: "category", AttributeType: "S" }, { AttributeName: "status", AttributeType: "S" },
      { AttributeName: "meetingPk", AttributeType: "S" }, { AttributeName: "meetingSort", AttributeType: "S" },
    ],
    GlobalSecondaryIndexes: [
      { IndexName: "Library", KeySchema: [{ AttributeName: "libraryPk", KeyType: "HASH" }, { AttributeName: "updatedAt", KeyType: "RANGE" }], Projection: { ProjectionType: "KEYS_ONLY" } },
      { IndexName: "ByCategory", KeySchema: [{ AttributeName: "category", KeyType: "HASH" }, { AttributeName: "updatedAt", KeyType: "RANGE" }], Projection: { ProjectionType: "KEYS_ONLY" } },
      { IndexName: "ByStatus", KeySchema: [{ AttributeName: "status", KeyType: "HASH" }, { AttributeName: "updatedAt", KeyType: "RANGE" }], Projection: { ProjectionType: "KEYS_ONLY" } },
      meetingIndex,
    ],
  }));
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: tableName });
  console.log(`DynamoDB documents table is ACTIVE: ${tableName}`);
}

main().catch((error) => {
  console.error("Failed to set up Board documents table.", error);
  process.exitCode = 1;
});
