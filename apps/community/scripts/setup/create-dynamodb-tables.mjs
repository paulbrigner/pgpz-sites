#!/usr/bin/env node
/**
 * Create the DynamoDB table used by NextAuth and PGPZ social proof records.
 *
 * Usage:
 *   REGION_AWS=us-east-1 NEXTAUTH_TABLE=PGPZCommunityNextAuth node scripts/setup/create-dynamodb-tables.mjs
 *
 *   node scripts/setup/create-dynamodb-tables.mjs \
 *     --region us-east-1 \
 *     --nextauth-table PGPZCommunityNextAuth
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

const args = process.argv.slice(2);
const usage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/setup/create-dynamodb-tables.mjs [options]",
      "",
      "Options:",
      "  --region <region>              AWS region (or REGION_AWS/AWS_REGION env)",
      "  --nextauth-table <name>        NextAuth table name (or NEXTAUTH_TABLE env)",
      "  --skip-ttl                     Do not enable TTL on the table",
    ].join("\n"),
  );
};

let region = process.env.REGION_AWS || process.env.AWS_REGION || "";
let nextAuthTable = process.env.NEXTAUTH_TABLE || "PGPZCommunityNextAuth";
let skipTtl = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  }
  if (arg === "--region" && args[i + 1]) {
    region = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--nextauth-table" && args[i + 1]) {
    nextAuthTable = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === "--skip-ttl" || arg === "--no-ttl") {
    skipTtl = true;
    continue;
  }
}

if (!region) {
  console.error("Missing region. Set REGION_AWS/AWS_REGION or pass --region.");
  usage();
  process.exit(1);
}

const client = new DynamoDBClient({ region });

async function ensureTtlEnabled(tableName) {
  if (skipTtl) return;
  try {
    const res = await client.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
    const status = res.TimeToLiveDescription?.TimeToLiveStatus;
    if (status === "ENABLED" || status === "ENABLING") {
      console.log(`TTL already ${status?.toLowerCase()} on ${tableName}.`);
      return;
    }
  } catch (err) {
    console.warn(`Unable to read TTL status for ${tableName}, continuing to set TTL.`, err?.message || err);
  }
  await client.send(
    new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: {
        AttributeName: "expires",
        Enabled: true,
      },
    }),
  );
  console.log(`TTL enabled on ${tableName} for attribute expires.`);
}

async function describeTable(tableName) {
  try {
    const res = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return res.Table || null;
  } catch (err) {
    const name = err?.name || err?.code;
    if (name === "ResourceNotFoundException") return null;
    throw err;
  }
}

function hasKeySchema(table, hash, range) {
  const keys = Array.isArray(table?.KeySchema) ? table.KeySchema : [];
  const hashOk = keys.some((k) => k.AttributeName === hash && k.KeyType === "HASH");
  const rangeOk = range ? keys.some((k) => k.AttributeName === range && k.KeyType === "RANGE") : true;
  return hashOk && rangeOk;
}

function hasGsi(table, indexName, hash, range) {
  const gsis = Array.isArray(table?.GlobalSecondaryIndexes) ? table.GlobalSecondaryIndexes : [];
  return gsis.some((idx) => {
    if (idx.IndexName !== indexName) return false;
    const keys = Array.isArray(idx.KeySchema) ? idx.KeySchema : [];
    const hashOk = keys.some((k) => k.AttributeName === hash && k.KeyType === "HASH");
    const rangeOk = keys.some((k) => k.AttributeName === range && k.KeyType === "RANGE");
    return hashOk && rangeOk;
  });
}

async function ensureNextAuthTable() {
  const existing = await describeTable(nextAuthTable);
  if (existing) {
    const keyOk = hasKeySchema(existing, "pk", "sk");
    const gsiOk = hasGsi(existing, "GSI1", "GSI1PK", "GSI1SK");
    if (!keyOk || !gsiOk) {
      console.warn(
        [
          `Table ${nextAuthTable} exists but does not match the expected schema.`,
          `Expected pk/sk keys and GSI1 (GSI1PK/GSI1SK).`,
        ].join(" "),
      );
    } else {
      console.log(`DynamoDB table exists: ${nextAuthTable}`);
    }
    await ensureTtlEnabled(nextAuthTable);
    return;
  }

  await client.send(
    new CreateTableCommand({
      TableName: nextAuthTable,
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
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
    }),
  );
  console.log(`CreateTable issued for ${nextAuthTable}. Waiting for ACTIVE...`);
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: nextAuthTable });
  console.log(`DynamoDB table is ACTIVE: ${nextAuthTable}`);
  await ensureTtlEnabled(nextAuthTable);
}

ensureNextAuthTable().catch((err) => {
  console.error("Failed to set up DynamoDB table.", err);
  process.exit(1);
});
