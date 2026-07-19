import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBetterAuthAdapterImplementation } from "./adapter";
import { createBetterAuthDynamoDBRateLimitStorage } from "./rate-limit";

const endpoint = process.env.PGPZ_DYNAMODB_INTEGRATION_ENDPOINT?.trim() || "";
const integrationRequired = process.env.PGPZ_DYNAMODB_INTEGRATION_REQUIRED === "1";
const tableName = `PgpzAuthContract-${process.pid}-${Date.now()}`;
const region = process.env.PGPZ_DYNAMODB_INTEGRATION_REGION?.trim() || "us-east-1";
const credentials = {
  accessKeyId: process.env.PGPZ_DYNAMODB_INTEGRATION_ACCESS_KEY?.trim() || "local",
  secretAccessKey: process.env.PGPZ_DYNAMODB_INTEGRATION_SECRET_KEY?.trim() || "local",
};

if (integrationRequired && !endpoint) {
  describe("DynamoDB integration configuration", () => {
    it("requires an explicit emulator endpoint", () => {
      throw new Error(
        "PGPZ_DYNAMODB_INTEGRATION_ENDPOINT is required when " +
          "PGPZ_DYNAMODB_INTEGRATION_REQUIRED=1.",
      );
    });
  });
}

const describeWithDynamoDB = endpoint ? describe.sequential : describe.skip;
const lowLevelClient = new DynamoDBClient({ endpoint, region, credentials });
const documentClient = DynamoDBDocument.from(lowLevelClient, {
  marshallOptions: {
    convertClassInstanceToMap: true,
    removeUndefinedValues: true,
  },
});

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const ownershipKey = (email: string) => {
  const normalized = normalizeEmail(email);
  return {
    pk: `EMAIL_OWNERSHIP#${normalized}`,
    sk: `EMAIL_OWNERSHIP#${normalized}`,
  };
};

class IntegrationOwnershipCollisionError extends Error {}

const userEmailOwnership = {
  normalizeEmail,
  ownershipKey,
  assertCompatible(
    record: Record<string, any> | null | undefined,
    { betterAuthUserId }: { betterAuthUserId: string },
  ) {
    const recordEmail = normalizeEmail(record?.email);
    const expectedKey = recordEmail ? ownershipKey(recordEmail) : null;
    if (
      record &&
      (record.type !== "EMAIL_OWNERSHIP" ||
        !expectedKey ||
        record.pk !== expectedKey.pk ||
        record.sk !== expectedKey.sk ||
        (record.betterAuthUserId && record.betterAuthUserId !== betterAuthUserId))
    ) {
      throw new IntegrationOwnershipCollisionError();
    }
  },
  claimTransactionItem({
    tableName,
    email,
    betterAuthUserId,
  }: {
    tableName: string;
    email: string;
    betterAuthUserId: string;
  }) {
    const normalized = normalizeEmail(email);
    return {
      Update: {
        TableName: tableName,
        Key: ownershipKey(normalized),
        UpdateExpression:
          "SET #type = :type, #email = :email, #createdAt = if_not_exists(#createdAt, :now), #updatedAt = :now, #betterAuthUserId = :betterAuthUserId",
        ConditionExpression:
          "(attribute_not_exists(#pk) OR #type = :type) AND " +
          "(attribute_not_exists(#email) OR #email = :email) AND " +
          "(attribute_not_exists(#betterAuthUserId) OR #betterAuthUserId = :betterAuthUserId)",
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#type": "type",
          "#email": "email",
          "#createdAt": "createdAt",
          "#updatedAt": "updatedAt",
          "#betterAuthUserId": "betterAuthUserId",
        },
        ExpressionAttributeValues: {
          ":type": "EMAIL_OWNERSHIP",
          ":email": normalized,
          ":now": new Date().toISOString(),
          ":betterAuthUserId": betterAuthUserId,
        },
      },
    };
  },
  releaseTransactionItem({
    tableName,
    email,
    betterAuthUserId,
  }: {
    tableName: string;
    email: string;
    betterAuthUserId: string;
  }) {
    return {
      Delete: {
        TableName: tableName,
        Key: ownershipKey(email),
        ConditionExpression:
          "attribute_not_exists(#pk) OR (#type = :type AND #email = :email AND " +
          "attribute_not_exists(#appUserId) AND #betterAuthUserId = :betterAuthUserId)",
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#type": "type",
          "#email": "email",
          "#appUserId": "appUserId",
          "#betterAuthUserId": "betterAuthUserId",
        },
        ExpressionAttributeValues: {
          ":type": "EMAIL_OWNERSHIP",
          ":email": normalizeEmail(email),
          ":betterAuthUserId": betterAuthUserId,
        },
      },
    };
  },
  releaseBetterAuthTransactionItem({
    tableName,
    email,
    betterAuthUserId,
    preserveAppOwner,
  }: {
    tableName: string;
    email: string;
    betterAuthUserId: string;
    preserveAppOwner: boolean;
  }) {
    if (!preserveAppOwner) {
      return this.releaseTransactionItem({ tableName, email, betterAuthUserId });
    }
    return {
      Update: {
        TableName: tableName,
        Key: ownershipKey(email),
        UpdateExpression: "SET #updatedAt = :now REMOVE #betterAuthUserId",
        ConditionExpression:
          "#type = :type AND #email = :email AND attribute_exists(#appUserId) AND " +
          "#betterAuthUserId = :betterAuthUserId",
        ExpressionAttributeNames: {
          "#type": "type",
          "#email": "email",
          "#appUserId": "appUserId",
          "#betterAuthUserId": "betterAuthUserId",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":type": "EMAIL_OWNERSHIP",
          ":email": normalizeEmail(email),
          ":betterAuthUserId": betterAuthUserId,
          ":now": new Date().toISOString(),
        },
      },
    };
  },
  collisionError: () => new IntegrationOwnershipCollisionError("email collision"),
};

async function waitForTable() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const result = await lowLevelClient.send(new DescribeTableCommand({ TableName: tableName }));
      if (result.Table?.TableStatus === "ACTIVE") return;
    } catch (error: any) {
      if (error?.name !== "ResourceNotFoundException") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`DynamoDB integration table ${tableName} did not become active.`);
}

async function createIntegrationTable() {
  const input = {
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" as const },
      { AttributeName: "sk", AttributeType: "S" as const },
      { AttributeName: "GSI1PK", AttributeType: "S" as const },
      { AttributeName: "GSI1SK", AttributeType: "S" as const },
      { AttributeName: "GSI2PK", AttributeType: "S" as const },
      { AttributeName: "GSI2SK", AttributeType: "S" as const },
    ],
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" as const },
      { AttributeName: "sk", KeyType: "RANGE" as const },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "GSI1",
        KeySchema: [
          { AttributeName: "GSI1PK", KeyType: "HASH" as const },
          { AttributeName: "GSI1SK", KeyType: "RANGE" as const },
        ],
        Projection: { ProjectionType: "ALL" as const },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
      {
        IndexName: "GSI2",
        KeySchema: [
          { AttributeName: "GSI2PK", KeyType: "HASH" as const },
          { AttributeName: "GSI2SK", KeyType: "RANGE" as const },
        ],
        Projection: { ProjectionType: "ALL" as const },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await lowLevelClient.send(new CreateTableCommand(input));
      return;
    } catch (error: any) {
      if (error?.name === "ResourceInUseException") return;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

describeWithDynamoDB("Better Auth adapter against an AWS-compatible DynamoDB endpoint", () => {
  beforeAll(async () => {
    await createIntegrationTable();
    await waitForTable();
  }, 20_000);

  afterAll(async () => {
    try {
      await lowLevelClient.send(new DeleteTableCommand({ TableName: tableName }));
    } finally {
      lowLevelClient.destroy();
    }
  });

  it("uses the GSI for supported lookups and performs atomic concurrent increments", async () => {
    const metrics = { query: 0, scan: 0 };
    const instrumentedClient = {
      get: (input: any) => documentClient.get(input),
      put: (input: any) => documentClient.put(input),
      query: (input: any) => {
        metrics.query += 1;
        return documentClient.query(input);
      },
      scan: (input: any) => {
        metrics.scan += 1;
        return documentClient.scan(input);
      },
      delete: (input: any) => documentClient.delete(input),
      update: (input: any) => documentClient.update(input),
      transactWrite: (input: any) => documentClient.transactWrite(input),
    };
    const adapter = createBetterAuthAdapterImplementation({
      documentClient: instrumentedClient,
      tableName,
      userEmailOwnership,
    });
    await adapter.create({
      model: "better_auth_sessions",
      data: {
        id: "integration-session",
        token: "integration-token",
        score: 0,
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
    });

    await expect(adapter.findOne<Record<string, any>>({
      model: "better_auth_sessions",
      where: [{ field: "token", value: "integration-token" }],
    })).resolves.toMatchObject({ id: "integration-session" });
    expect(metrics.query).toBeGreaterThan(0);
    expect(metrics.scan).toBe(0);

    await Promise.all(Array.from({ length: 25 }, () => adapter.incrementOne({
      model: "better_auth_sessions",
      where: [{ field: "id", value: "integration-session" }],
      increment: { score: 1 },
    })));
    await expect(adapter.findOne<Record<string, any>>({
      model: "better_auth_sessions",
      where: [{ field: "id", value: "integration-session" }],
    })).resolves.toMatchObject({ score: 25 });
  });

  it("enforces transactional email ownership and preserves app ownership on delete", async () => {
    const adapter = createBetterAuthAdapterImplementation({
      documentClient,
      tableName,
      userEmailOwnership,
    });
    await adapter.create({
      model: "better_auth_users",
      data: { id: "integration-user-1", email: "Member@Example.Test" },
    });
    await expect(adapter.create({
      model: "better_auth_users",
      data: { id: "integration-user-2", email: "member@example.test" },
    })).rejects.toBeInstanceOf(IntegrationOwnershipCollisionError);

    await documentClient.update({
      TableName: tableName,
      Key: ownershipKey("member@example.test"),
      UpdateExpression: "SET #appUserId = :appUserId",
      ExpressionAttributeNames: { "#appUserId": "appUserId" },
      ExpressionAttributeValues: { ":appUserId": "integration-app-user" },
    });
    await adapter.delete({
      model: "better_auth_users",
      where: [{ field: "id", value: "integration-user-1" }],
    });

    const ownership = await documentClient.get({
      TableName: tableName,
      Key: ownershipKey("member@example.test"),
      ConsistentRead: true,
    });
    expect(ownership.Item).toMatchObject({ appUserId: "integration-app-user" });
    expect(ownership.Item).not.toHaveProperty("betterAuthUserId");
  });

  it.each([
    {
      model: "better_auth_sessions",
      records: [
        { id: "reverse-session-1", token: "reverse-token-1", userId: "reverse-user-1" },
        { id: "reverse-session-2", token: "reverse-token-2", userId: "reverse-user-1" },
        { id: "reverse-session-3", token: "reverse-token-3", userId: "reverse-user-2" },
      ],
    },
    {
      model: "better_auth_accounts",
      records: [
        { id: "reverse-account-1", providerId: "github", accountId: "reverse-github-1", userId: "reverse-user-1" },
        { id: "reverse-account-2", providerId: "google", accountId: "reverse-google-1", userId: "reverse-user-1" },
        { id: "reverse-account-3", providerId: "github", accountId: "reverse-github-2", userId: "reverse-user-2" },
      ],
    },
  ])("uses paginated GSI2 userId queries for $model findMany/deleteMany", async ({
    model,
    records,
  }) => {
    const metrics = { query: 0, scan: 0 };
    const instrumentedClient = {
      get: (input: any) => documentClient.get(input),
      put: (input: any) => documentClient.put(input),
      query: (input: any) => {
        metrics.query += 1;
        return documentClient.query({ ...input, Limit: 1 });
      },
      scan: (input: any) => {
        metrics.scan += 1;
        return documentClient.scan(input);
      },
      delete: (input: any) => documentClient.delete(input),
      update: (input: any) => documentClient.update(input),
      transactWrite: (input: any) => documentClient.transactWrite(input),
    };
    const adapter = createBetterAuthAdapterImplementation({
      documentClient: instrumentedClient,
      tableName,
    });
    for (const data of records) await adapter.create({ model, data });

    await expect(adapter.findMany<Record<string, any>>({
      model,
      where: [{ field: "userId", value: "reverse-user-1" }],
    })).resolves.toHaveLength(2);
    expect(metrics.query).toBeGreaterThan(1);
    expect(metrics.scan).toBe(0);
    const queriesAfterFind = metrics.query;

    await expect(adapter.deleteMany({
      model,
      where: [{ field: "userId", value: "reverse-user-1" }],
    })).resolves.toBe(2);
    expect(metrics.query).toBeGreaterThan(queriesAfterFind + 1);
    expect(metrics.scan).toBe(0);
    await expect(adapter.findMany<Record<string, any>>({
      model,
      where: [{ field: "userId", value: "reverse-user-2" }],
    })).resolves.toEqual([expect.objectContaining({ id: records[2].id })]);
  });

  it("shares the durable rate-limit counter across storage instances", async () => {
    const first = createBetterAuthDynamoDBRateLimitStorage({ documentClient, tableName });
    const second = createBetterAuthDynamoDBRateLimitStorage({ documentClient, tableName });
    const decisions = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      (index % 2 ? first : second).consume!("integration-rate-key", { window: 60, max: 5 }),
    ));
    expect(decisions.filter(({ allowed }) => allowed)).toHaveLength(5);
    expect(decisions.filter(({ allowed }) => !allowed)).toHaveLength(1);
  });
});
