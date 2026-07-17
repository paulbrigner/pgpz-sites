import "server-only";

export {
  createBetterAuthAdapterImplementation,
  createBetterAuthDynamoDBAdapter,
} from "./adapter";
export { createBetterAuthDynamoDBRateLimitStorage } from "./rate-limit";
export type { BetterAuthAdapterCondition } from "./adapter";
export type { BetterAuthRateLimitStorage } from "./rate-limit";
export type {
  BetterAuthDynamoDBConfig,
  BetterAuthRateLimitDynamoDBConfig,
  DynamoDBDocumentClientLike,
  DynamoDBItem,
} from "./dynamodb-contract";
