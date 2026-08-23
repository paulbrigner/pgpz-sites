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
const tableName = valueAfter("--audit-table") || process.env.BOARD_AUDIT_TABLE || "PGPZBoardAuditLog";
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
  if (await describe()) {
    console.log(`DynamoDB audit table exists: ${tableName}`);
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
    ],
  }));
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: tableName });
  console.log(`DynamoDB audit table is ACTIVE: ${tableName}`);
}

main().catch((error) => {
  console.error("Failed to set up Board audit table.", error);
  process.exitCode = 1;
});
