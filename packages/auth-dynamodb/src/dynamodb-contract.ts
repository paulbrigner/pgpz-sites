export type DynamoDBItem = Record<string, any>;

export type DynamoDBDocumentClientLike = {
  get(input: any): Promise<{ Item?: DynamoDBItem }>;
  put(input: any): Promise<any>;
  query(input: any): Promise<{ Items?: DynamoDBItem[]; LastEvaluatedKey?: DynamoDBItem }>;
  scan(input: any): Promise<{ Items?: DynamoDBItem[]; LastEvaluatedKey?: DynamoDBItem }>;
  delete(input: any): Promise<any>;
  update(input: any): Promise<{ Attributes?: DynamoDBItem }>;
  transactWrite?(input: any): Promise<any>;
};

export type BetterAuthUserEmailOwnershipConfig = Readonly<{
  normalizeEmail(value: unknown): string;
  ownershipKey(email: string): DynamoDBItem;
  assertCompatible(
    record: DynamoDBItem | null | undefined,
    bindings: { betterAuthUserId: string },
  ): void;
  claimTransactionItem(input: {
    tableName: string;
    email: string;
    betterAuthUserId: string;
  }): DynamoDBItem;
  releaseTransactionItem(input: {
    tableName: string;
    email: string;
    betterAuthUserId: string;
  }): DynamoDBItem;
  releaseBetterAuthTransactionItem(input: {
    tableName: string;
    email: string;
    betterAuthUserId: string;
    preserveAppOwner: boolean;
  }): DynamoDBItem;
  collisionError(): Error;
}>;

export type BetterAuthDynamoDBConfig = Readonly<{
  documentClient: DynamoDBDocumentClientLike;
  tableName: string;
  indexName?: string;
  userIdIndexName?: string;
  adapterId?: string;
  adapterName?: string;
  userEmailOwnership?: BetterAuthUserEmailOwnershipConfig;
}>;

export type BetterAuthRateLimitDynamoDBConfig = Readonly<{
  documentClient: Pick<DynamoDBDocumentClientLike, "get" | "put" | "update">;
  tableName: string;
  keyPrefix?: string;
  stateTtlSeconds?: number;
  windowTtlGraceSeconds?: number;
  now?: () => number;
}>;

export function assertDynamoDBInjection(
  config: { documentClient?: unknown; tableName?: unknown },
  methods: readonly string[],
) {
  if (typeof config.tableName !== "string" || config.tableName.trim().length === 0) {
    throw new TypeError("DynamoDB tableName must be a non-empty injected string.");
  }
  if (typeof config.documentClient !== "object" || config.documentClient === null) {
    throw new TypeError("DynamoDB documentClient must be an injected object.");
  }
  for (const method of methods) {
    if (typeof (config.documentClient as Record<string, unknown>)[method] !== "function") {
      throw new TypeError(`DynamoDB documentClient must implement ${method}().`);
    }
  }
}
