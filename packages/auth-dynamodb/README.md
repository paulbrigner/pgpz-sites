# `@pgpz/auth-dynamodb`

Injected DynamoDB persistence contracts for Better Auth.

The package exports factories rather than application singletons:

- `createBetterAuthDynamoDBAdapter({ documentClient, tableName })`
- `createBetterAuthAdapterImplementation({ documentClient, tableName })`
- `createBetterAuthDynamoDBRateLimitStorage({ documentClient, tableName })`

Indexed lookups use the injected `GSI1` name by default. ID lookups use the
base key, and only unsupported query shapes use a compatibility scan. Session
and verification records receive DynamoDB TTL values. Rate-limit keys are
hashed and counters are updated atomically in DynamoDB, so limits remain shared
across serverless instances.

No environment variable, application alias, table singleton, branded model,
membership workflow, or infrastructure client is selected by this package.
