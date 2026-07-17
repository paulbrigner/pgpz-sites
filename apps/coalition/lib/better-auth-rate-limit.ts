import "server-only";

import { createHash } from "node:crypto";
import type { BetterAuthOptions } from "better-auth";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

type BetterAuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

const RATE_LIMIT_TYPE = "BETTER_AUTH#RATE_LIMIT";
const STATE_TTL_SECONDS = 5 * 60;
const WINDOW_TTL_GRACE_SECONDS = 60;

const digestKey = (key: string) => createHash("sha256").update(key).digest("hex");

const stateKey = (key: string) => {
  const digest = digestKey(key);
  return {
    pk: `BETTER_AUTH_RATE_LIMIT#${digest}`,
    sk: "STATE",
    digest,
  };
};

const windowKey = (key: string, windowSeconds: number, windowStartedAt: number) => {
  const digest = digestKey(key);
  return {
    pk: `BETTER_AUTH_RATE_LIMIT#${digest}`,
    sk: `WINDOW#${windowSeconds}#${windowStartedAt}`,
    digest,
  };
};

const numericValue = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function createBetterAuthDynamoDBRateLimitStorage(): BetterAuthRateLimitStorage {
  return {
    async get(key) {
      const recordKey = stateKey(key);
      const result = await documentClient.get({
        TableName: TABLE_NAME,
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
      const nowSeconds = Math.ceil(Date.now() / 1000);
      await documentClient.put({
        TableName: TABLE_NAME,
        Item: {
          pk: recordKey.pk,
          sk: recordKey.sk,
          type: RATE_LIMIT_TYPE,
          keyHash: recordKey.digest,
          count: numericValue(value.count),
          lastRequest: numericValue(value.lastRequest, Date.now()),
          expires: nowSeconds + STATE_TTL_SECONDS,
        },
      });
    },

    async consume(key, rule) {
      const windowSeconds = Math.max(1, Math.floor(numericValue(rule.window, 1)));
      const max = Math.max(1, Math.floor(numericValue(rule.max, 1)));
      const now = Date.now();
      const windowMs = windowSeconds * 1000;
      const windowStartedAt = Math.floor(now / windowMs) * windowMs;
      const windowEndsAt = windowStartedAt + windowMs;
      const recordKey = windowKey(key, windowSeconds, windowStartedAt);
      const expires = Math.ceil(windowEndsAt / 1000) + WINDOW_TTL_GRACE_SECONDS;

      const result = await documentClient.update({
        TableName: TABLE_NAME,
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
          ":lastRequest": now,
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
        retryAfter: Math.max(1, Math.ceil((windowEndsAt - now) / 1000)),
      };
    },
  };
}

export const betterAuthDynamoDBRateLimitStorage =
  createBetterAuthDynamoDBRateLimitStorage();
