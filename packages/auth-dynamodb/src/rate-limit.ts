import "server-only";

import { createHash } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import {
  assertDynamoDBInjection,
  type BetterAuthRateLimitDynamoDBConfig,
} from "./dynamodb-contract";

export type BetterAuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

const RATE_LIMIT_TYPE = "BETTER_AUTH#RATE_LIMIT";
const DEFAULT_STATE_TTL_SECONDS = 5 * 60;
const DEFAULT_WINDOW_TTL_GRACE_SECONDS = 60;

const digestKey = (key: string) => createHash("sha256").update(key).digest("hex");

const positiveInteger = (value: number | undefined, fallback: number, label: string) => {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 1) throw new TypeError(`${label} must be a positive number.`);
  return Math.floor(value);
};

const numericValue = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function createBetterAuthDynamoDBRateLimitStorage(
  config: BetterAuthRateLimitDynamoDBConfig,
): BetterAuthRateLimitStorage {
  assertDynamoDBInjection(config, ["get", "put", "update"]);
  const documentClient = config.documentClient;
  const tableName = config.tableName.trim();
  const keyPrefix = config.keyPrefix?.trim() || "BETTER_AUTH_RATE_LIMIT";
  const stateTtlSeconds = positiveInteger(
    config.stateTtlSeconds,
    DEFAULT_STATE_TTL_SECONDS,
    "stateTtlSeconds",
  );
  const windowTtlGraceSeconds = positiveInteger(
    config.windowTtlGraceSeconds,
    DEFAULT_WINDOW_TTL_GRACE_SECONDS,
    "windowTtlGraceSeconds",
  );
  const now = config.now || Date.now;

  const stateKey = (key: string) => {
    const digest = digestKey(key);
    return { pk: `${keyPrefix}#${digest}`, sk: "STATE", digest };
  };

  const windowKey = (key: string, windowSeconds: number, windowStartedAt: number) => {
    const digest = digestKey(key);
    return {
      pk: `${keyPrefix}#${digest}`,
      sk: `WINDOW#${windowSeconds}#${windowStartedAt}`,
      digest,
    };
  };

  return {
    async get(key) {
      const recordKey = stateKey(key);
      const result = await documentClient.get({
        TableName: tableName,
        Key: { pk: recordKey.pk, sk: recordKey.sk },
        ConsistentRead: true,
      });
      const item = result.Item;
      if (!item || item.type !== RATE_LIMIT_TYPE) return null;
      return {
        key,
        count: numericValue(item.count),
        lastRequest: numericValue(item.lastRequest),
      };
    },

    async set(key, value) {
      const recordKey = stateKey(key);
      const nowMilliseconds = now();
      await documentClient.put({
        TableName: tableName,
        Item: {
          pk: recordKey.pk,
          sk: recordKey.sk,
          type: RATE_LIMIT_TYPE,
          keyHash: recordKey.digest,
          count: numericValue(value.count),
          lastRequest: numericValue(value.lastRequest, nowMilliseconds),
          expires: Math.ceil(nowMilliseconds / 1000) + stateTtlSeconds,
        },
      });
    },

    async consume(key, rule) {
      const windowSeconds = positiveInteger(numericValue(rule.window, 1), 1, "rate-limit window");
      const max = positiveInteger(numericValue(rule.max, 1), 1, "rate-limit max");
      const nowMilliseconds = now();
      const windowMilliseconds = windowSeconds * 1000;
      const windowStartedAt = Math.floor(nowMilliseconds / windowMilliseconds) * windowMilliseconds;
      const windowEndsAt = windowStartedAt + windowMilliseconds;
      const recordKey = windowKey(key, windowSeconds, windowStartedAt);
      const expires = Math.ceil(windowEndsAt / 1000) + windowTtlGraceSeconds;

      const result = await documentClient.update({
        TableName: tableName,
        Key: { pk: recordKey.pk, sk: recordKey.sk },
        UpdateExpression:
          "SET #type = :type, #keyHash = :keyHash, #lastRequest = :lastRequest, #windowStartedAt = :windowStartedAt, #windowSeconds = :windowSeconds, #expires = :expires ADD #count :one",
        ExpressionAttributeNames: {
          "#type": "type",
          "#keyHash": "keyHash",
          "#count": "count",
          "#lastRequest": "lastRequest",
          "#windowStartedAt": "windowStartedAt",
          "#windowSeconds": "windowSeconds",
          "#expires": "expires",
        },
        ExpressionAttributeValues: {
          ":type": RATE_LIMIT_TYPE,
          ":keyHash": recordKey.digest,
          ":one": 1,
          ":lastRequest": nowMilliseconds,
          ":windowStartedAt": windowStartedAt,
          ":windowSeconds": windowSeconds,
          ":expires": expires,
        },
        ReturnValues: "ALL_NEW",
      });

      const count = numericValue(result.Attributes?.count, Number.NaN);
      if (!Number.isFinite(count)) {
        throw new Error("Better Auth rate-limit counter did not return a numeric count.");
      }
      if (count <= max) return { allowed: true, retryAfter: null };
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((windowEndsAt - nowMilliseconds) / 1000)),
      };
    },
  };
}
